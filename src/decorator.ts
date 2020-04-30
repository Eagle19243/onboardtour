import { reaction } from "mobx";
import * as vscode from "vscode";
import { ICON_URL } from "./constants";
import { onboardtour, onboardtourStep, store } from "./store";
import { getStepFileUri, getWorkspacePath } from "./utils";

const TOUR_DECORATOR = vscode.window.createTextEditorDecorationType({
  gutterIconPath: vscode.Uri.parse(ICON_URL),
  gutterIconSize: "contain",
  overviewRulerColor: "rgb(246,232,154)",
  overviewRulerLane: vscode.OverviewRulerLane.Right
});

type onboardtourStepTuple = [onboardtour, onboardtourStep, number];

async function getTourSteps(
  document: vscode.TextDocument,
  lineNumber?: number
): Promise<onboardtourStepTuple[]> {
  const steps: onboardtourStepTuple[] = store.tours.flatMap(tour =>
    tour.steps.map(
      (step, stepNumber) => [tour, step, stepNumber] as onboardtourStepTuple
    )
  );

  const tourSteps = await Promise.all(
    steps.map(async ([tour, step, stepNumber]) => {
      const workspaceRoot = getWorkspacePath(tour);
      const uri = await getStepFileUri(step, workspaceRoot);

      if (
        uri.toString().localeCompare(document.uri.toString()) === 0 &&
        (!lineNumber || step.line! - 1 === lineNumber)
      ) {
        return [tour, step, stepNumber];
      }
    })
  );

  // @ts-ignore
  return tourSteps.filter(i => i);
}

async function setDecorations(editor: vscode.TextEditor) {
  const tourSteps = await getTourSteps(editor.document);
  if (tourSteps.length === 0) {
    return;
  }

  const ranges = tourSteps.map(
    ([, step]) => new vscode.Range(step.line! - 1, 0, step.line! - 1, 1000)
  );

  editor.setDecorations(TOUR_DECORATOR, ranges);
}

let hoverProviderDisposable: vscode.Disposable | undefined;
function registerHoverProvider() {
  return vscode.languages.registerHoverProvider("*", {
    provideHover: async (
      document: vscode.TextDocument,
      position: vscode.Position
    ) => {
      const tourSteps = await getTourSteps(document, position.line);
      if (tourSteps.length === 0) {
        return;
      }

      const hovers = tourSteps.map(([tour, _, stepNumber]) => {
        const args = encodeURIComponent(JSON.stringify([tour.id, stepNumber]));
        const command = `command:onboardtour._startTourById?${args}`;
        return `onboardtour: ${tour.title} (Step #${
          stepNumber + 1
        }) &nbsp;[Start Tour](${command} "Start Tour")\n`;
      });

      const content = new vscode.MarkdownString(hovers.join("\n"));
      content.isTrusted = true;
      return new vscode.Hover(content);
    }
  });
}

let disposables: vscode.Disposable[] = [];
export async function registerDecorators() {
  reaction(
    () => [
      store.showMarkers,
      store.tours.map(tour => [tour.title, tour.steps])
    ],
    () => {
      const activeEditor = vscode.window.activeTextEditor;

      if (store.showMarkers) {
        if (hoverProviderDisposable === undefined) {
          hoverProviderDisposable = registerHoverProvider();
          disposables.push(hoverProviderDisposable);
        }

        disposables.push(
          vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
              setDecorations(editor);
            }
          })
        );

        if (activeEditor) {
          setDecorations(activeEditor);
        }
      } else if (activeEditor) {
        activeEditor.setDecorations(TOUR_DECORATOR, []);
        disposables.forEach(disposable => disposable.dispose());
        hoverProviderDisposable = undefined;
        disposables = [];
      }
    }
  );
}
