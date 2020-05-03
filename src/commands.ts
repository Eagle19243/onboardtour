import { comparer, runInAction } from "mobx";
// import * as path from "path";
import * as vscode from "vscode";
import { workspace } from "vscode";
import { EXTENSION_NAME } from "./constants";
import { api, RefType } from "./git";
import { onboardtourComment, focusPlayer } from "./player";
import { onboardtour, store } from "./store";
import {
  endCurrentonboardtour,
  moveCurrentonboardtourBackward,
  moveCurrentonboardtourForward,
  startonboardtour,
  // exportTour
} from "./store/actions";
// import { discoverTours } from "./store/provider";
import { onboardtourNode, onboardtourStepNode } from "./tree/nodes";
// import { getActiveWorkspacePath } from "./utils";
interface onboardtourQuickPickItem extends vscode.QuickPickItem {
  tour: onboardtour;
}

// let terminal: vscode.Terminal | null;
export function registerCommands() {
  // This is a "private" command that's used exclusively
  // by the hover description for tour markers.
  vscode.commands.registerCommand(
    `${EXTENSION_NAME}._startTourById`,
    async (id: string, lineNumber: number) => {
      const tour = store.tours.find(tour => tour.id === id);
      if (tour) {
        startonboardtour(tour, lineNumber);
      }
    }
  );

  vscode.commands.registerCommand(
    `${EXTENSION_NAME}.startTour`,
    async (
      tour?: onboardtour | onboardtourNode,
      stepNumber?: number,
      workspaceRoot?: vscode.Uri
    ) => {
      if (tour) {
        const targetTour = tour instanceof onboardtourNode ? tour.tour : tour;
        return startonboardtour(targetTour, stepNumber, workspaceRoot);
      }

      const items: onboardtourQuickPickItem[] = store.tours.map(tour => ({
        label: tour.title!,
        tour: tour,
        detail: tour.description
      }));

      if (items.length === 1) {
        return startonboardtour(items[0].tour);
      }

      const response = await vscode.window.showQuickPick(items, {
        placeHolder: "Select the tour to start..."
      });

      if (response) {
        startonboardtour(response.tour);
      }
    }
  );

  vscode.commands.registerCommand(
    `${EXTENSION_NAME}.endTour`,
    endCurrentonboardtour
  );

  vscode.commands.registerCommand(
    `${EXTENSION_NAME}.previousTourStep`,
    moveCurrentonboardtourBackward
  );

  vscode.commands.registerCommand(
    `${EXTENSION_NAME}.nextTourStep`,
    moveCurrentonboardtourForward
  );

  vscode.commands.registerCommand(`${EXTENSION_NAME}.resumeTour`, focusPlayer);

  function getTourFileUri(workspaceRoot: vscode.Uri, title: string) {
    const file = title
      .toLocaleLowerCase()
      .replace(/\s/g, "-")
      .replace(/[^\w\d-_]/g, "");

    return vscode.Uri.parse(`${workspaceRoot}/.tours/${file}.tour`);
  }

  async function writeTourFile(
    workspaceRoot: vscode.Uri,
    title: string,
    ref?: string
  ): Promise<onboardtour> {
    const uri = getTourFileUri(workspaceRoot, title);

    const tour = { title, steps: [] };
    if (ref && ref !== "HEAD") {
      (tour as any).ref = ref;
    }

    const tourContent = JSON.stringify(tour, null, 2);
    await vscode.workspace.fs.writeFile(uri, new Buffer(tourContent));

    (tour as any).id = uri.toString();

    // @ts-ignore
    return tour as onboardtour;
  }

  interface WorkspaceQuickPickItem extends vscode.QuickPickItem {
    uri: vscode.Uri;
  }

  // const REENTER_TITLE_RESPONSE = "Re-enter title";
  vscode.commands.registerCommand(
    `${EXTENSION_NAME}.recordTour`,
    async (placeHolderTitle?: string) => {
      const title = await vscode.window.showInputBox({
        prompt: "Specify the title of the tour",
        value: placeHolderTitle
      });

      if (!title) {
        return;
      }

      let workspaceRoot = workspace.workspaceFolders![0].uri;
      if (workspace.workspaceFolders!.length > 1) {
        const items: WorkspaceQuickPickItem[] = workspace.workspaceFolders!.map(
          ({ name, uri }) => ({
            label: name,
            uri: uri
          })
        );

        const response = await vscode.window.showQuickPick(items, {
          placeHolder: "Select the workspace to save the tour to"
        });

        if (!response) {
          return;
        }

        workspaceRoot = response.uri;
      }

      const ref = await promptForTourRef(workspaceRoot);
      const tour = await writeTourFile(workspaceRoot, title, ref);

      startonboardtour(tour);

      store.isRecording = true;
      await vscode.commands.executeCommand(
        "setContext",
        "onboardtour:recording",
        true
      );

      if (
        await vscode.window.showInformationMessage(
          "onboardtour recording started! Begin creating steps by opening a file, clicking the + button to the left of a line of code, and then adding the appropriate comments.",
          "Cancel"
        )
      ) {
        const uri = vscode.Uri.parse(tour.id);
        vscode.workspace.fs.delete(uri);

        endCurrentonboardtour();
        store.isRecording = false;
        vscode.commands.executeCommand(
          "setContext",
          "onboardtour:recording",
          false
        );
      }
    }
  );

  function getStepSelection() {
    const activeEditor = vscode.window.activeTextEditor;
    if (
      activeEditor &&
      activeEditor.selection &&
      !activeEditor.selection.isEmpty
    ) {
      const { start, end } = activeEditor.selection;

      // Convert the selection from 0-based
      // to 1-based to make it easier to
      // edit the JSON tour file by hand.
      const selection = {
        start: {
          line: start.line + 1,
          character: start.character + 1
        },
        end: {
          line: end.line + 1,
          character: end.character + 1
        }
      };

      const previousStep = store.activeTour!.tour.steps[
        store.activeTour!.step - 1
      ];

      // Check whether the end-user forgot to "reset"
      // the selection from the previous step, and if so,
      // ignore it from this step since it's not likely useful.
      if (
        !previousStep ||
        !previousStep.selection ||
        !comparer.structural(previousStep.selection, selection)
      ) {
        return selection;
      }
    }
  }

  vscode.commands.registerCommand(
    `${EXTENSION_NAME}.saveTourStep`,
    async (comment: onboardtourComment) => {
      if (!comment.parent) {
        return;
      }

      const content =
        comment.body instanceof vscode.MarkdownString
          ? comment.body.value
          : comment.body;

      runInAction(() => {
        const tourStep = store.activeTour!.tour!.steps[store.activeTour!.step];
        tourStep.description = content;

        const selection = getStepSelection();
        if (selection) {
          tourStep.selection = selection;
        }
      });

      saveTour(store.activeTour!.tour);

      comment.parent.comments = comment.parent.comments.map(cmt => {
        if ((cmt as onboardtourComment).id === comment.id) {
          cmt.mode = vscode.CommentMode.Preview;
        }

        return cmt;
      });
    }
  );

  async function saveTour(tour: onboardtour) {
    const uri = vscode.Uri.parse(tour.id);
    const newTour = {
      ...tour
    };
    delete newTour.id;
    const tourContent = JSON.stringify(newTour, null, 2);

    return vscode.workspace.fs.writeFile(uri, new Buffer(tourContent));
  }

  // async function updateTourProperty(tour: onboardtour, property: string) {
  //   const propertyValue = await vscode.window.showInputBox({
  //     prompt: `Enter the ${property} for this tour`,
  //     // @ts-ignore
  //     value: tour[property]
  //   });

  //   if (!propertyValue) {
  //     return;
  //   }

  //   // @ts-ignore
  //   tour[property] = propertyValue;

  //   saveTour(tour);
  // }

  function moveStep(
    movement: number,
    node: onboardtourStepNode | onboardtourComment
  ) {
    let tour: onboardtour, stepNumber: number;

    if (node instanceof onboardtourComment) {
      tour = store.activeTour!.tour;
      stepNumber = store.activeTour!.step;
    } else {
      tour = node.tour;
      stepNumber = node.stepNumber;
    }

    runInAction(async () => {
      const step = tour.steps[stepNumber];
      tour.steps.splice(stepNumber, 1);
      tour.steps.splice(stepNumber + movement, 0, step);

      // If the user is moving the currently active step, then move
      // the tour play along with it as well.
      if (
        store.activeTour &&
        tour.id === store.activeTour.tour.id &&
        stepNumber === store.activeTour.step
      ) {
        store.activeTour.step += movement;
      }

      await saveTour(tour);
    });
  }

  vscode.commands.registerCommand(
    `${EXTENSION_NAME}.moveTourStepBack`,
    moveStep.bind(null, -1)
  );

  vscode.commands.registerCommand(
    `${EXTENSION_NAME}.moveTourStepForward`,
    moveStep.bind(null, 1)
  );

  interface GitRefQuickPickItem extends vscode.QuickPickItem {
    ref?: string;
  }

  async function promptForTourRef(
    workspaceRoot: vscode.Uri
  ): Promise<string | undefined> {
    // If for some reason the Git extension isn't available,
    // then we won't be able to ask the user to select a git ref.
    if (!api) {
      return;
    }

    const repository = api.getRepository(workspaceRoot);

    // The opened project isn't a git repository, and
    // so there's no commit/tag/branch to associate the tour with.
    if (!repository) {
      return;
    }

    const currentBranch = repository.state.HEAD!.name;
    let items: GitRefQuickPickItem[] = [
      {
        label: "$(circle-slash) None",
        description:
          "Allow the tour to apply to all versions of this repository",
        ref: "HEAD",
        alwaysShow: true
      },
      {
        label: `$(git-branch) Current branch (${currentBranch})`,
        description: "Allow the tour to apply to all versions of this branch",
        ref: currentBranch,
        alwaysShow: true
      },
      {
        label: "$(git-commit) Current commit",
        description: "Keep the tour associated with a specific commit",
        ref: repository.state.HEAD ? repository.state.HEAD.commit! : "",
        alwaysShow: true
      }
    ];

    const tags = repository.state.refs
      .filter(ref => ref.type === RefType.Tag)
      .map(ref => ref.name!)
      .sort()
      .map(ref => ({
        label: `$(tag) ${ref}`,
        description: "Keep the tour associated with a specific tag",
        ref
      }));

    if (tags) {
      items.push(...tags);
    }

    const response = await vscode.window.showQuickPick<GitRefQuickPickItem>(
      items,
      {
        placeHolder: "Select the Git ref to associate the tour with:"
      }
    );

    if (response) {
      return response.ref;
    }
  }

  vscode.commands.registerCommand(
    `${EXTENSION_NAME}.openTourFile`,
    async () => {
      const uri = await vscode.window.showOpenDialog({
        filters: {
          Tours: ["json"]
        },
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: "Open Tour"
      });

      if (!uri) {
        return;
      }

      try {
        const contents = await vscode.workspace.fs.readFile(uri[0]);
        const tour = JSON.parse(contents.toString());
        tour.id = uri[0].toString();
        startonboardtour(tour);
      } catch {
        vscode.window.showErrorMessage(
          "This file doesn't appear to be a valid tour. Please inspect its contents and try again."
        );
      }
    }
  );
}
