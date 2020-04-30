import { observable } from "mobx";
import { CommentThread, Uri } from "vscode";

export const PENDING_TOUR_ID = "@@RECORDING";

export interface onboardtourStepPosition {
  line: number;
  character: number;
}

export interface onboardtourStep {
  title?: string;
  description: string;
  file?: string;
  uri?: string;
  line?: number;
  selection?: { start: onboardtourStepPosition; end: onboardtourStepPosition };
  contents?: string;
}

export interface onboardtour {
  id: string;
  title: string;
  description?: string;
  steps: onboardtourStep[];
  ref?: string;
}

export interface ActiveTour {
  tour: onboardtour;
  step: number;

  // When recording, a tour can be active, without
  // having created an actual comment yet.
  thread: CommentThread | null | undefined;

  // In order to resolve relative file
  // paths, we need to know the workspace root
  workspaceRoot?: Uri;
}

export interface Store {
  tours: onboardtour[];
  activeTour: ActiveTour | null;
  hasTours: boolean;
  isRecording: boolean;
  showMarkers: boolean;
}

export const store: Store = observable({
  tours: [],
  activeTour: null,
  isRecording: false,
  get hasTours() {
    return this.tours.length > 0;
  },
  showMarkers: false
});
