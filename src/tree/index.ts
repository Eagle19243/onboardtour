import { reaction } from "mobx";
import {
  Disposable,
  Event,
  EventEmitter,
  TreeDataProvider,
  TreeItem,
  window
} from "vscode";
import { EXTENSION_NAME } from "../constants";
import { store } from "../store";
import { onboardtourNode, onboardtourStepNode, RecordTourNode } from "./nodes";

class onboardtourTreeProvider
  implements TreeDataProvider<TreeItem>, Disposable {
  private _disposables: Disposable[] = [];

  private _onDidChangeTreeData = new EventEmitter<TreeItem>();
  public readonly onDidChangeTreeData: Event<TreeItem> = this
    ._onDidChangeTreeData.event;

  constructor(private extensionPath: string) {
    reaction(
      () => [
        store.tours,
        store.hasTours,
        store.isRecording,
        store.activeTour
          ? [
              store.activeTour.tour.title,
              store.activeTour.tour.description,
              store.activeTour.tour.steps.map(step => [
                step.title,
                step.description
              ])
            ]
          : null
      ],
      () => {
        this._onDidChangeTreeData.fire();
      }
    );
  }

  getTreeItem = (node: TreeItem) => node;

  async getChildren(element?: TreeItem): Promise<TreeItem[] | undefined> {
    if (!element) {
      if (!store.hasTours && !store.activeTour) {
        return [new RecordTourNode()];
      } else {
        const tours = store.tours.map(
          tour => new onboardtourNode(tour, this.extensionPath)
        );

        if (
          store.activeTour &&
          !store.tours.find(tour => tour.id === store.activeTour?.tour.id)
        ) {
          tours.unshift(
            new onboardtourNode(store.activeTour.tour, this.extensionPath)
          );
        }

        return tours;
      }
    } else if (element instanceof onboardtourNode) {
      if (element.tour.steps.length === 0) {
        return [new TreeItem("No steps recorded yet")];
      } else {
        return element.tour.steps.map(
          (_, index) => new onboardtourStepNode(element.tour, index)
        );
      }
    }
  }

  async getParent(element: TreeItem): Promise<TreeItem | null> {
    if (element instanceof onboardtourStepNode) {
      return new onboardtourNode(element.tour, this.extensionPath);
    } else {
      return null;
    }
  }

  dispose() {
    this._disposables.forEach(disposable => disposable.dispose());
  }
}

export function registerTreeProvider(extensionPath: string) {
  const treeDataProvider = new onboardtourTreeProvider(extensionPath);
  const treeView = window.createTreeView(`${EXTENSION_NAME}.tours`, {
    showCollapseAll: true,
    treeDataProvider
  });

  reaction(
    () => [
      store.activeTour
        ? [
            store.activeTour.tour.title,
            store.activeTour.tour.steps.map(step => [step.title]),
            store.activeTour.step
          ]
        : null
    ],
    () => {
      if (store.activeTour) {
        treeView.reveal(
          new onboardtourStepNode(store.activeTour.tour, store.activeTour!.step)
        );
      } else {
        // TODO: Once VS Code supports it, we want
        // to de-select the step node once the tour ends.
      }
    }
  );
}
