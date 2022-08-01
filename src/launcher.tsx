/* eslint-disable no-inner-declarations */
import * as React from "react";

import { JupyterFrontEnd } from "@jupyterlab/application";

import { VDomModel, VDomRenderer } from "@jupyterlab/apputils";

import { ILauncher } from "@jupyterlab/launcher";

import { ISettingRegistry } from "@jupyterlab/settingregistry";

import { IStateDB } from "@jupyterlab/statedb";

import {
  addIcon,
  classes,
  closeIcon,
  LabIcon
} from "@jupyterlab/ui-components";

import {
  ArrayExt,
  ArrayIterator,
  each,
  IIterator,
  map,
  toArray
} from "@lumino/algorithm";

import { CommandRegistry } from "@lumino/commands";

import { ReadonlyJSONObject } from "@lumino/coreutils";

import { DisposableDelegate, IDisposable } from "@lumino/disposable";

import { AttachedProperty } from "@lumino/properties";

import { Widget } from "@lumino/widgets";

import { OSInfo, WebDSService } from "@webds/service";

import { EXTENSION_ID } from "./index";

const LAUNCHER_CLASS = "jp-webdsLauncher";

const KERNEL_CATEGORIES = ["Notebook", "Console"];

const FAVOURITES_CATEGORY = "Favourites";

const FW_INSTALL_CATEGORY = "Firmware Install";

let webdsService: WebDSService | null;
let updateAvailable = false;

export class LauncherModel extends VDomModel implements ILauncher {
  constructor(
    app: JupyterFrontEnd,
    settings?: ISettingRegistry.ISettings | null,
    state?: IStateDB | null
  ) {
    super();
    this._app = app;
    this._settings = settings || null;
    this._state = state || null;
    this.dispose();
  }

  private _addContextMenu(item: ILauncher.IItemOptions) {
    const args = { ...item.args };
    const label = this._app.commands.label(item.command, args);
    const addCommand = `webds_favourites_${label.replace(/ /g, "_")}:add`;
    const addID = `webds-launcher-card-${label
      .replace(/ /g, "-")
      .replace(/[()]/g, "")}`;
    this._app.commands.addCommand(addCommand, {
      label: "Add to Favourites",
      caption: "Add to Favourites",
      icon: addIcon,
      execute: () => {
        this.addToFavourites(item);
        if (webdsService) {
          const webdsLauncher = webdsService.ui.getWebDSLauncher() as any;
          if (webdsLauncher) {
            webdsLauncher.update();
          }
        }
      }
    });
    this._app.contextMenu.addItem({
      command: addCommand,
      selector: `#${addID}`
    });
    const removeCommand = `webds_favourites_${label.replace(/ /g, "_")}:remove`;
    const removeID = addID.concat("-fav");
    this._app.commands.addCommand(removeCommand, {
      label: "Remove from Favourites",
      caption: "Remove from Favourites",
      icon: closeIcon,
      execute: () => {
        this.removeFromFavourites(item);
        if (webdsService) {
          const webdsLauncher = webdsService.ui.getWebDSLauncher() as any;
          if (webdsLauncher) {
            webdsLauncher.update();
          }
        }
      }
    });
    this._app.contextMenu.addItem({
      command: removeCommand,
      selector: `#${removeID}`
    });
  }

  private _saveFavourites() {
    if (this._state) {
      this._state
        .save(`${EXTENSION_ID}:favourites`, this._favourites as any)
        .catch((reason: Error) => {
          console.error(
            `Failed to save ${EXTENSION_ID}:favourites\n${reason.message}`,
            reason
          );
        });
    }
  }

  get categories(): string[] {
    if (this._settings) {
      return this._settings.composite["categories"] as string[];
    } else {
      return ["IPython", "Other"];
    }
  }

  add(options: ILauncher.IItemOptions): IDisposable {
    const item = Private.createItem(options);
    this._addContextMenu(item);

    this._items.push(item);
    this.stateChanged.emit(void 0);

    return new DisposableDelegate(() => {
      ArrayExt.removeFirstOf(this._items, item);
      this.stateChanged.emit(void 0);
    });
  }

  items(): IIterator<ILauncher.IItemOptions> {
    return new ArrayIterator(this._items);
  }

  get favourites(): ILauncher.IItemOptions[] {
    return this._favourites;
  }

  set favourites(favourites: ILauncher.IItemOptions[]) {
    this._favourites = favourites;
  }

  addToFavourites(item: ILauncher.IItemOptions): void {
    if (
      this._favourites.some((favourite) => favourite.command === item.command)
    ) {
      return;
    }
    this._favourites.push(item);
    this._saveFavourites();
  }

  removeFromFavourites(item: ILauncher.IItemOptions): void {
    this._favourites = this._favourites.filter(
      (favourite) => favourite.command !== item.command
    );
    this._saveFavourites();
  }

  private _app: JupyterFrontEnd;
  private _items: ILauncher.IItemOptions[] = [];
  private _settings: ISettingRegistry.ISettings | null = null;
  private _state: IStateDB | null = null;
  private _favourites: ILauncher.IItemOptions[] = [];
}

export class Launcher extends VDomRenderer<LauncherModel> {
  constructor(options: INewLauncher.IOptions, service: WebDSService | null) {
    super(options.model);
    this._commands = options.commands;
    this._cwd = options.cwd;
    this._callback = options.callback;
    this.addClass(LAUNCHER_CLASS);
    webdsService = service;
  }

  get cwd(): string {
    return this._cwd;
  }
  set cwd(value: string) {
    this._cwd = value;
    this.update();
  }

  get pending(): boolean {
    return this._pending;
  }
  set pending(value: boolean) {
    this._pending = value;
  }

  protected render(): React.ReactElement<any> | null {
    if (!this.model) {
      return null;
    }

    if (webdsService) {
      const osInfo: OSInfo = webdsService.pinormos.getOSInfo();
      updateAvailable = osInfo.repo.version > osInfo.current.version;
    }

    const categories: {
      [category: string]: ILauncher.IItemOptions[][];
    } = Object.create(null);

    each(this.model.items(), (item) => {
      const cat = item.category || "Other";
      if (!(cat in categories)) {
        categories[cat] = [];
      }
      categories[cat].push([item]);
    });

    const notebooks = categories["Notebook"];
    if (notebooks) {
      delete categories["Notebook"];
    }
    const consoles = categories["Console"];
    if (consoles) {
      delete categories["Console"];
    }

    const kernels = notebooks;
    consoles.forEach((console_) => {
      if (console_[0].args === undefined) return;
      const consoleName =
        (console_[0].args["kernelPreference"] &&
          (console_[0].args["kernelPreference"] as ReadonlyJSONObject)[
            "name"
          ]) ||
        "";
      const consoleLabel = this._commands.label(
        console_[0].command,
        console_[0].args
      );
      const kernel = kernels.find((kernel) => {
        if (kernel[0].args === undefined) return false;
        const kernelName = kernel[0].args["kernelName"] || "";
        const kernelLabel = this._commands.label(
          kernel[0].command,
          kernel[0].args
        );
        return kernelName === consoleName && kernelLabel === consoleLabel;
      });
      if (kernel) {
        kernel.push(console_[0]);
      } else {
        kernels.push(console_);
      }
    });
    categories["Touch - Development"] = kernels;

    for (const cat in categories) {
      categories[cat] = categories[cat].sort(
        (a: ILauncher.IItemOptions[], b: ILauncher.IItemOptions[]) => {
          return Private.sortCmp(a[0], b[0], this._commands, this.cwd);
        }
      );
    }

    categories[FAVOURITES_CATEGORY] = this.model.favourites.map((favourite) => {
      return [favourite];
    });

    const others = categories["Other"];
    if (others) {
      delete categories["Other"];
    }
    categories["Touch - Development"] = categories[
      "Touch - Development"
    ].concat(others);

    const orderedCategories: string[] = [];
    each(this.model.categories, (cat) => {
      if (cat in categories) {
        orderedCategories.push(cat);
      }
    });

    for (const cat in categories) {
      if (this.model.categories.indexOf(cat) === -1) {
        if (
          cat !== "Touch - Config Library" &&
          cat !== "DSDK - Documentation"
        ) {
          orderedCategories.push(cat);
        }
      }
    }

    const tops: React.ReactElement<any>[] = [];
    const sections: React.ReactElement<any>[] = [];

    orderedCategories.forEach((cat) => {
      const section = (
        <div className="jp-webdsLauncher-section" key={cat}>
          <div className="jp-webdsLauncher-section-header">
            <h2 className="jp-webdsLauncher-section-title">{cat}</h2>
          </div>
          <div className="jp-webdsLauncher-card-container">
            {toArray(
              map(categories[cat], (items: ILauncher.IItemOptions[]) => {
                return Card(items, this, this._commands, this._callback, cat);
              })
            )}
          </div>
        </div>
      );
      cat === FAVOURITES_CATEGORY || cat === FW_INSTALL_CATEGORY
        ? tops.push(section)
        : sections.push(section);
    });

    return (
      <>
        <div className="jp-webdsLauncher-body">
          <div className="jp-webdsLauncher-content">
            <div className="jp-webdsLauncher-content-top">
              <div className="jp-webdsLauncher-content-top-0">{tops[0]}</div>
              <div className="jp-webdsLauncher-content-top-1">{tops[1]}</div>
            </div>
            <div className="jp-webdsLauncher-content-main">{sections}</div>
          </div>
        </div>
        <div className="jp-webdsLauncher-shadow jp-webdsLauncher-shadow-top"></div>
        <div className="jp-webdsLauncher-shadow jp-webdsLauncher-shadow-bottom"></div>
      </>
    );
  }

  private _commands: CommandRegistry;
  private _cwd = "";
  private _callback: (widget: Widget) => void;
  private _pending = false;
}

export namespace INewLauncher {
  export interface IOptions {
    commands: CommandRegistry;
    model: LauncherModel;
    cwd: string;
    callback: (widget: Widget) => void;
  }
}

function Card(
  items: ILauncher.IItemOptions[],
  launcher: Launcher,
  commands: CommandRegistry,
  launcherCallback: (widget: Widget) => void,
  category: string
): React.ReactElement<any> {
  const item = items[0];
  const command = item.command;
  const args = { ...item.args, cwd: launcher.cwd };
  const label = commands.label(command, args);
  const caption = items.length > 1 ? label : commands.caption(command, args);
  const iconClass = commands.iconClass(command, args);
  const icon_ = commands.icon(command, args);
  const icon = icon_ === iconClass ? undefined : icon_;

  let id = `webds-launcher-card-${label
    .replace(/ /g, "-")
    .replace(/[()]/g, "")}`;
  if (category === FAVOURITES_CATEGORY) {
    id = id.concat("-fav");
  }

  const onClickFactory = (
    item: ILauncher.IItemOptions
  ): ((event: any) => void) => {
    const onClick = (event: Event): void => {
      event.stopPropagation();
      if (launcher.pending === true) {
        return;
      }
      launcher.pending = true;
      void commands
        .execute(item.command, { ...item.args, cwd: launcher.cwd })
        .then((value) => {
          launcher.pending = false;
          if (value instanceof Widget) {
            launcherCallback(value);
            launcher.dispose();
          }
        })
        .catch((reason) => {
          launcher.pending = false;
          console.error(`Failed to launch launcher item\n${reason}`);
        });
    };

    return onClick;
  };

  const mainOnClick = onClickFactory(item);

  const getOptions = (items: ILauncher.IItemOptions[]): JSX.Element[] => {
    return items.map((item) => {
      let label = "Open";
      if (
        item.category &&
        (items.length > 1 || KERNEL_CATEGORIES.indexOf(item.category) > -1)
      ) {
        label = item.category;
      }
      return (
        <div
          className="jp-webdsLauncher-option-button"
          key={label.toLowerCase()}
          onClick={onClickFactory(item)}
        >
          <span className="jp-webdsLauncher-option-button-text">
            {label.toUpperCase()}
          </span>
        </div>
      );
    });
  };

  // Return the VDOM element.
  return (
    <div
      className="jp-webdsLauncher-card"
      id={id}
      key={Private.keyProperty.get(item)}
      title={caption}
      onClick={mainOnClick}
      tabIndex={100}
      style={{ position: "relative" }}
    >
      <div className="jp-webdsLauncher-icon">
        {item.kernelIconUrl ? (
          <img
            className="jp-webdsLauncher-icon-kernel"
            src={item.kernelIconUrl}
          />
        ) : (
          <LabIcon.resolveReact
            icon={icon}
            iconClass={classes(iconClass, "jp-Icon-cover")}
            stylesheet="launcherCard"
          />
        )}
      </div>
      <div className="jp-webdsLauncher-label" title={label}>
        {label}
      </div>
      {items.length > 1 && (
        <div className="jp-webdsLauncher-options">{getOptions(items)}</div>
      )}
      {updateAvailable && label === "DSDK Update" && (
        <div
          id={"webds-launcher-card-DSDK-Update-Red-Dot"}
          style={{
            width: "10px",
            height: "10px",
            backgroundColor: "red",
            borderRadius: "50%",
            position: "absolute",
            top: "5px",
            right: "5px"
          }}
        />
      )}
    </div>
  );
}

namespace Private {
  let id = 0;

  export const keyProperty = new AttachedProperty<
    ILauncher.IItemOptions,
    number
  >({
    name: "key",
    create: (): number => id++
  });

  export function createItem(
    options: ILauncher.IItemOptions
  ): ILauncher.IItemOptions {
    return {
      ...options,
      category: options.category || "",
      rank: options.rank !== undefined ? options.rank : Infinity
    };
  }

  export function sortCmp(
    a: ILauncher.IItemOptions,
    b: ILauncher.IItemOptions,
    commands: CommandRegistry,
    cwd: string
  ): number {
    const r1 = a.rank;
    const r2 = b.rank;
    if (r1 !== r2 && r1 !== undefined && r2 !== undefined) {
      return r1 < r2 ? -1 : 1;
    }

    const aLabel = commands.label(a.command, { ...a.args, cwd });
    const bLabel = commands.label(b.command, { ...b.args, cwd });
    return aLabel.localeCompare(bLabel);
  }
}
