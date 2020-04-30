import * as path from "path";
import { ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { EXTENSION_NAME, FS_SCHEME } from "../constants";
import { onboardtour, store } from "../store";
import { getFileUri, getWorkspacePath } from "../utils";

function isRecording(tour: onboardtour) {
  return (
    store.isRecording &&
    store.activeTour &&
    store.activeTour.tour.id === tour.id
  );
}

export class onboardtourNode extends TreeItem {
  constructor(public tour: onboardtour, extensionPath: string) {
    super(
      tour.title!,
      isRecording(tour)
        ? TreeItemCollapsibleState.Expanded
        : TreeItemCollapsibleState.Collapsed
    );

    this.tooltip = tour.description;
    this.description = `${tour.steps.length} steps`;

    const contextValues = ["onboardtour.tour"];

    if (isRecording(tour)) {
      contextValues.push("recording");
    }

    const isActive = store.activeTour && tour.id === store.activeTour?.tour.id;
    if (isActive) {
      contextValues.push("active");
    }

    this.contextValue = contextValues.join(".");

    const icon = isRecording(tour)
      ? "tour-recording"
      : isActive
      ? "tour-active"
      : "tour";

    this.iconPath = {
      dark: path.join(extensionPath, `images/dark/${icon}.svg`),
      light: path.join(extensionPath, `images/light/${icon}.svg`)
    };
  }
}

const HEADING_PATTERN = /^#+\s*(.*)/;
function getStepLabel(tour: onboardtour, stepNumber: number) {
  const step = tour.steps[stepNumber];

  const prefix = `#${stepNumber + 1} - `;
  let label;
  if (step.title) {
    label = step.title;
  } else if (HEADING_PATTERN.test(step.description.trim())) {
    label = step.description.trim().match(HEADING_PATTERN)![1];
  } else {
    label = step.uri ? step.uri! : decodeURIComponent(step.file!);
  }

  return `${prefix}${label}`;
}

export class onboardtourStepNode extends TreeItem {
  constructor(public tour: onboardtour, public stepNumber: number) {
    super(getStepLabel(tour, stepNumber));

    const step = tour.steps[stepNumber];

    const workspaceRoot =
      store.activeTour &&
      store.activeTour.tour.id === tour.id &&
      store.activeTour.workspaceRoot
        ? store.activeTour.workspaceRoot
        : undefined;

    this.command = {
      command: `${EXTENSION_NAME}.startTour`,
      title: "Start Tour",
      arguments: [tour, stepNumber, workspaceRoot]
    };

    let resourceUri;
    if (step.uri) {
      resourceUri = Uri.parse(step.uri);
    } else if (step.contents) {
      resourceUri = Uri.parse(`${FS_SCHEME}://${step.file}`);
    } else {
      const resourceRoot = workspaceRoot
        ? workspaceRoot.toString()
        : getWorkspacePath(tour);

      resourceUri = getFileUri(resourceRoot, step.file!);
    }

    this.resourceUri = resourceUri;
    this.iconPath = ThemeIcon.File;

    const contextValues = ["onboardtour.tourStep"];
    if (stepNumber > 0) {
      contextValues.push("hasPrevious");
    }

    if (stepNumber < tour.steps.length - 1) {
      contextValues.push("hasNext");
    }

    this.contextValue = contextValues.join(".");
  }
}

export class RecordTourNode extends TreeItem {
  constructor() {
    super("Record new tour...");

    this.command = {
      command: `${EXTENSION_NAME}.recordTour`,
      title: "Record Tour"
    };
  }
}
