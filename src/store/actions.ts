import { commands, Memento, Uri, window, workspace } from "vscode";
import { onboardtour, store } from ".";
import { EXTENSION_NAME, FS_SCHEME } from "../constants";
import { startPlayer, stopPlayer } from "../player";
import { getWorkspaceKey, getWorkspaceUri, getStepFileUri } from "../utils";

const CAN_EDIT_TOUR_KEY = `${EXTENSION_NAME}:canEditTour`;
const IN_TOUR_KEY = `${EXTENSION_NAME}:inTour`;

export function startonboardtour(
  tour: onboardtour,
  stepNumber?: number,
  workspaceRoot?: Uri,
  startInEditMode: boolean = false,
  canEditTour: boolean = true
) {
  startPlayer();

  if (!workspaceRoot) {
    workspaceRoot = getWorkspaceUri(tour);
  }

  store.activeTour = {
    tour,
    step: stepNumber ? stepNumber : tour.steps.length ? 0 : -1,
    workspaceRoot,
    thread: null
  };

  commands.executeCommand("setContext", IN_TOUR_KEY, true);
  commands.executeCommand("setContext", CAN_EDIT_TOUR_KEY, canEditTour);

  if (startInEditMode) {
    store.isRecording = true;
    commands.executeCommand("setContext", "onboardtour:recording", true);
  }
}

export async function endCurrentonboardtour() {
  if (store.isRecording) {
    store.isRecording = false;
    commands.executeCommand("setContext", "onboardtour:recording", false);
  }

  stopPlayer();

  store.activeTour = null;
  commands.executeCommand("setContext", IN_TOUR_KEY, false);

  window.visibleTextEditors.forEach(editor => {
    if (editor.document.uri.scheme === FS_SCHEME) {
      editor.hide();
    }
  });
}

export function moveCurrentonboardtourBackward() {
  --store.activeTour!.step;
}

export function moveCurrentonboardtourForward() {
  store.activeTour!.step++;
}

export async function promptForTour(globalState: Memento) {
  const workspaceKey = getWorkspaceKey();
  const key = `${EXTENSION_NAME}:${workspaceKey}`;
  if (store.hasTours && !globalState.get(key)) {
    globalState.update(key, true);

    if (
      await window.showInformationMessage(
        "This workspace has guided tours you can take to get familiar with the codebase.",
        "Start onboardtour"
      )
    ) {
      commands.executeCommand(`${EXTENSION_NAME}.startTour`);
    }
  }
}

export async function exportTour(tour: onboardtour) {
  const newTour = {
    ...tour
  };

  newTour.steps = await Promise.all(
    newTour.steps.map(async step => {
      if (step.contents && step.uri) {
        return step;
      }

      const workspaceRoot = workspace.workspaceFolders
        ? workspace.workspaceFolders[0].uri.toString()
        : "";

      const stepFileUri = await getStepFileUri(step, workspaceRoot, tour.ref);

      const stepFileContents = await workspace.fs.readFile(stepFileUri);

      return {
        ...step,
        contents: stepFileContents.toString()
      };
    })
  );

  delete newTour.id;
  delete newTour.ref;

  return JSON.stringify(newTour, null, 2);
}
