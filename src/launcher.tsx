/* eslint-disable no-inner-declarations */

import {
  VDomModel,
  VDomRenderer
} from '@jupyterlab/apputils';

import { ILauncher } from '@jupyterlab/launcher';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { classes, LabIcon } from '@jupyterlab/ui-components';

import {
  ArrayExt,
  ArrayIterator,
  each,
  IIterator,
  map,
  toArray
} from '@lumino/algorithm';

import { CommandRegistry } from '@lumino/commands';

import { ReadonlyJSONObject } from '@lumino/coreutils';

import { DisposableDelegate, IDisposable } from '@lumino/disposable';

import { AttachedProperty } from '@lumino/properties';

import { Widget } from '@lumino/widgets';

import * as React from 'react';

import { webdsIcon } from './icons';

const LAUNCHER_CLASS = 'jp-webdsLauncher';

const KERNEL_CATEGORIES = ['Notebook', 'Console'];

export class LauncherModel extends VDomModel implements ILauncher {
  constructor(settings?: ISettingRegistry.ISettings) {
    super();
    this._settings = settings || null;
    this.dispose();
  }

  get categories(): string[] {
    if (this._settings) {
      return this._settings.composite['categories'] as string[];
    } else {
      return ['IPython', 'Other'];
    }
  }

  add(options: ILauncher.IItemOptions): IDisposable {
    const item = Private.createItem(options);

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

  private _items: ILauncher.IItemOptions[] = [];
  private _settings: ISettingRegistry.ISettings | null = null;
}

export class Launcher extends VDomRenderer<LauncherModel> {
  constructor(options: INewLauncher.IOptions) {
    super(options.model);
    this._commands = options.commands;
    this._cwd = options.cwd;
    this._callback = options.callback;
    this.addClass(LAUNCHER_CLASS);
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

    const categories: {
      [category: string]: ILauncher.IItemOptions[][];
    } = Object.create(null);

    each(this.model.items(), (item, index) => {
      const cat = item.category || 'Other';
      if (!(cat in categories)) {
        categories[cat] = [];
      }
      categories[cat].push([item]);
    });

    const notebooks = categories['Notebook'];
    if (notebooks) {
      delete categories['Notebook'];
    }
    const consoles = categories['Console'];
    if (consoles) {
      delete categories['Console'];
    }

    const kernels = notebooks;
    consoles.forEach(console_ => {
      if (console_[0].args === undefined)
        return;
      const consoleName = (console_[0].args['kernelPreference'] && (console_[0].args['kernelPreference'] as ReadonlyJSONObject)['name']) || '';
      const consoleLabel = this._commands.label(console_[0].command, console_[0].args);
      const kernel = kernels.find(kernel => {
        if (kernel[0].args === undefined)
          return false;
        const kernelName = kernel[0].args['kernelName'] || '';
        const kernelLabel = this._commands.label(kernel[0].command, kernel[0].args);
        return kernelName === consoleName && kernelLabel === consoleLabel;
      });
      if (kernel) {
        kernel.push(console_[0]);
      } else {
        kernels.push(console_);
      }
    });
    categories['IPython'] = kernels;

    for (const cat in categories) {
      categories[cat] = categories[cat].sort(
        (a: ILauncher.IItemOptions[], b: ILauncher.IItemOptions[]) => {
          return Private.sortCmp(a[0], b[0], this._commands, this.cwd);
        }
      );
    }

    const orderedCategories: string[] = [];
    each(this.model.categories, (cat, index) => {
      if (cat in categories) {
        orderedCategories.push(cat);
      }
    });

    for (const cat in categories) {
      if (this.model.categories.indexOf(cat) === -1) {
        if (cat !== 'WebDS_Documentation') {
          orderedCategories.push(cat);
        }
      }
    }

    const floats: React.ReactElement<any>[] = [];
    const sections: React.ReactElement<any>[] = [];

    orderedCategories.forEach(cat => {
      if (categories[cat].length === 0) {
        return;
      }

      const webds = cat === 'WebDS';
      const kernel = cat === 'IPython';
      const item = categories[cat][0][0];
      const command = item.command;
      const args = {...item.args, cwd: this.cwd};

      const iconClass = this._commands.iconClass(command, args);
      const icon_ = this._commands.icon(command, args);
      const icon = icon_ === iconClass ? undefined : icon_;

      const _kernel = kernel ? '-kernel' : '';

      const section = (
        <div className={`jp-webdsLauncher-section${_kernel}`} key={cat}>
          <div className="jp-webdsLauncher-section-header">
            {webds ? (
              <webdsIcon.react
                stylesheet="launcherSection"
              />
            ) : (
              <LabIcon.resolveReact
                icon={icon}
                iconClass={classes(iconClass, 'jp-Icon-cover')}
                stylesheet="launcherSection"
              />
            )}
            <h2 className="jp-webdsLauncher-section-title">
              {cat}
            </h2>
          </div>
          <div className={`jp-webdsLauncher-card-container`}>
            {toArray(
              map(categories[cat], (items: ILauncher.IItemOptions[]) => {
                return Card(
                  webds,
                  kernel,
                  items,
                  this,
                  this._commands,
                  this._callback
                );
              })
            )}
          </div>
        </div>
      );
      if (kernel) {
        floats.push(section);
      } else {
        sections.push(section);
      }
    });

    return (
      <div className="jp-webdsLauncher-body">
        <div className="jp-webdsLauncher-content">
          <div className="jp-webdsLauncher-content-float">{floats}</div>
          <div className="jp-webdsLauncher-content-main">{sections}</div>
        </div>
      </div>
    );
  }

  private _commands: CommandRegistry;
  private _cwd = '';
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
  webds: boolean,
  kernel: boolean,
  items: ILauncher.IItemOptions[],
  launcher: Launcher,
  commands: CommandRegistry,
  launcherCallback: (widget: Widget) => void
): React.ReactElement<any> {
  const item = items[0];
  const command = item.command;
  const args = {...item.args, cwd: launcher.cwd};
  const caption = commands.caption(command, args);
  const label = commands.label(command, args);
  const title = kernel ? label : caption || label;

  const onClickFactory = (item: ILauncher.IItemOptions): ((event: any) => void) => {
    const onClick = (event: Event): void => {
      event.stopPropagation();
      if (launcher.pending === true) {
        return;
      }
      launcher.pending = true;
      void commands.execute(item.command, {...item.args, cwd: launcher.cwd})
        .then(value => {
          launcher.pending = false;
          if (value instanceof Widget) {
            launcherCallback(value);
            launcher.dispose();
          }
        })
        .catch(reason => {
          launcher.pending = false;
          console.error(`Failed to launch launcher item\n${reason}`);
        });
    };

    return onClick;
  };

  const mainOnClick = onClickFactory(item);

  const onkeypress = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      mainOnClick(event);
    }
  };

  const getOptions = (items: ILauncher.IItemOptions[]): JSX.Element[] => {
    return items.map(item => {
      let label = 'Open';
      if (item.category && (items.length > 1 || KERNEL_CATEGORIES.indexOf(item.category) > -1)) {
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

  const iconClass = commands.iconClass(command, args);
  const icon_ = commands.icon(command, args);
  const icon = icon_ === iconClass ? undefined : icon_;

  const _other = webds || kernel ? '' : '-other';

  // Return the VDOM element.
  if (kernel) {
    return (
      <div
        className={`jp-webdsLauncher-card`}
        key={Private.keyProperty.get(item)}
        title={title}
        data-category={item.category || 'Other'}
        onClick={mainOnClick}
        onKeyPress={onkeypress}
        tabIndex={100}
      >
        <div className={`jp-webdsLauncher-icon`}>
          {item.kernelIconUrl ? (
            <img
              className="jp-webdsLauncher-icon-kernel"
              src={item.kernelIconUrl}
            />
          ) : (
            <div>
              {label[0].toUpperCase()}
            </div>
          )}
        </div>
        <div
          className={`jp-webdsLauncher-label`}
          title={label}
        >
          {label}
        </div>
        <div className="jp-webdsLauncher-options">
          {getOptions(items)}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`jp-webdsLauncher-card${_other}`}
      key={Private.keyProperty.get(item)}
      title={title}
      data-category={item.category || 'Other'}
      onClick={mainOnClick}
      onKeyPress={onkeypress}
      tabIndex={100}
    >
      <div className={`jp-webdsLauncher-icon${_other}`}>
        <LabIcon.resolveReact
          icon={icon}
          iconClass={classes(iconClass, 'jp-Icon-cover')}
          stylesheet="launcherCard"/>
      </div>
      <div
        className={`jp-webdsLauncher-label${_other}`}
        title={label}
      >
          {label}
      </div>
    </div>
  );
}

namespace Private {
  let id = 0;

  export const keyProperty = new AttachedProperty<ILauncher.IItemOptions, number>({
    name: 'key',
    create: (): number => id++
  });

  export function createItem(
    options: ILauncher.IItemOptions
  ): ILauncher.IItemOptions {
    return {
      ...options,
      category: options.category || '',
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

    const aLabel = commands.label(a.command, {...a.args, cwd});
    const bLabel = commands.label(b.command, {...b.args, cwd});
    return aLabel.localeCompare(bLabel);
  }
}
