import { comparer, runInAction, set } from "mobx";
import * as vscode from "vscode";
import { onboardtour, store } from ".";
import { EXTENSION_NAME, VSCODE_DIRECTORY } from "../constants";
import { endCurrentonboardtour } from "./actions";

const MAIN_TOUR_FILES = [".tour", `${VSCODE_DIRECTORY}/main.tour`];

const SUB_TOUR_DIRECTORIES = [`${VSCODE_DIRECTORY}/tours`, `.tours`];

const HAS_TOURS_KEY = `${EXTENSION_NAME}:hasTours`;

export async function discoverTours(): Promise<void> {
  const tours = await Promise.all(
    vscode.workspace.workspaceFolders!.map(async workspaceFolder => {
      const workspaceRoot = workspaceFolder.uri.toString();
      const mainTours = await discoverMainTours(workspaceRoot);
      const tours = await discoverSubTours(workspaceRoot);

      if (mainTours) {
        tours.push(...mainTours);
      }

      return tours;
    })
  );

  runInAction(() => {
    store.tours = tours.flat().sort((a, b) => a.title.localeCompare(b.title));

    if (store.activeTour) {
      const tour = store.tours.find(
        tour => tour.id === store.activeTour!.tour.id
      );

      if (tour) {
        if (!comparer.structural(store.activeTour.tour, tour)) {
          // Since the active tour could be already observed,
          // we want to update it in place with the new properties.
          set(store.activeTour.tour, tour);
        }
      } else {
        // The user deleted the tour
        // file that's associated with
        // the active tour, so end it
        endCurrentonboardtour();
      }
    }
  });

  vscode.commands.executeCommand("setContext", HAS_TOURS_KEY, store.hasTours);
}

async function discoverMainTours(
  workspaceRoot: string
): Promise<onboardtour[]> {
  const tours = await Promise.all(
    MAIN_TOUR_FILES.map(async tourFile => {
      try {
        const uri = vscode.Uri.parse(`${workspaceRoot}/${tourFile}`);
        const mainTourContent = (
          await vscode.workspace.fs.readFile(uri)
        ).toString();
        const tour = JSON.parse(mainTourContent);
        tour.id = uri.toString();
        return tour;
      } catch {}
    })
  );

  return tours.filter(tour => tour);
}

async function readTourDirectory(
  tourDirectory: string
): Promise<onboardtour[]> {
  try {
    const uri = vscode.Uri.parse(tourDirectory);
    const tourFiles = await vscode.workspace.fs.readDirectory(uri);
    const tours = await Promise.all(
      tourFiles.map(async ([file, type]) => {
        if (type === vscode.FileType.File) {
          return readTourFile(tourDirectory, file);
        } else {
          return readTourDirectory(`${tourDirectory}/${file}`);
        }
      })
    );

    return tours.flat().filter(tour => tour);
  } catch {
    return [];
  }
}

async function readTourFile(
  directory: string,
  file: string
): Promise<onboardtour | undefined> {
  try {
    const tourUri = vscode.Uri.parse(`${directory}/${file}`);
    const tourContent = (
      await vscode.workspace.fs.readFile(tourUri)
    ).toString();
    const tour = JSON.parse(tourContent);
    tour.id = tourUri.toString();
    return tour;
  } catch {}
}

async function discoverSubTours(workspaceRoot: string): Promise<onboardtour[]> {
  const tours = await Promise.all(
    SUB_TOUR_DIRECTORIES.map(directory =>
      readTourDirectory(`${workspaceRoot}/${directory}`)
    )
  );

  return tours.flat();
}

vscode.workspace.onDidChangeWorkspaceFolders(discoverTours);

const watcher = vscode.workspace.createFileSystemWatcher(
  "**/{.vscode/tours,.tours}/**/*.{json,tour}"
);

watcher.onDidChange(discoverTours);
watcher.onDidCreate(discoverTours);
watcher.onDidDelete(discoverTours);
