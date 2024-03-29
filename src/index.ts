import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { MainAreaWidget, WidgetTracker } from '@jupyterlab/apputils';
import { ILauncher } from '@jupyterlab/launcher';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IStateDB } from '@jupyterlab/statedb';
import { toArray } from '@lumino/algorithm';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { Widget } from '@lumino/widgets';
import { WebDSService } from '@webds/service';

import { webdsIcon } from './icons';
import { Launcher, LauncherModel } from './launcher';

namespace Attributes {
  export const command = 'launcher:create';
  export const id = 'webds_launcher';
  export const label = 'Launcher';
  export const caption = 'Launcher';
}

namespace Private {
  // eslint-disable-next-line prefer-const
  export let id = 0;
}

const command = Attributes.command;

let webdsLauncher: HTMLElement | null;
let webdsLauncherBody: Element | null;
let isScrolling = false;

function setShadows(event: any) {
  if (!isScrolling) {
    window.requestAnimationFrame(function () {
      if (event.target.scrollTop > 0) {
        webdsLauncher!.classList.add('off-top');
      } else {
        webdsLauncher!.classList.remove('off-top');
      }
      if (
        Math.abs(
          event.target.scrollHeight -
            event.target.clientHeight -
            event.target.scrollTop
        ) > 3
      ) {
        webdsLauncher!.classList.add('off-bottom');
      } else {
        webdsLauncher!.classList.remove('off-bottom');
      }
      isScrolling = false;
    });
    isScrolling = true;
  }
}

export const EXTENSION_ID = '@webds/launcher:plugin';

const plugin: JupyterFrontEndPlugin<ILauncher> = {
  id: EXTENSION_ID,
  autoStart: true,
  optional: [
    ILabShell,
    ILayoutRestorer,
    ISettingRegistry,
    IStateDB,
    WebDSService
  ],
  provides: ILauncher,
  activate
};

async function activate(
  app: JupyterFrontEnd,
  labShell: ILabShell | null,
  restorer: ILayoutRestorer | null,
  settingRegistry: ISettingRegistry | null,
  state: IStateDB | null,
  service: WebDSService | null
): Promise<ILauncher> {
  console.log('JupyterLab extension @webds/launcher is activated!');

  const { commands, shell } = app;

  let settings: ISettingRegistry.ISettings | undefined = undefined;
  if (settingRegistry) {
    try {
      settings = await settingRegistry.load(EXTENSION_ID);
    } catch (reason) {
      console.error(`Failed to load settings for ${EXTENSION_ID}\n${reason}`);
    }
  }

  const model = new LauncherModel(app, settings, state);

  if (service) {
    service.ui.setWebDSLauncherModel(model);
  }

  let main: MainAreaWidget;

  commands.addCommand(Attributes.command, {
    label: Attributes.label,
    caption: Attributes.caption,
    execute: async (args: ReadonlyPartialJSONObject) => {
      if (!main || main.isDisposed) {
        const id = `launcher-${Private.id++}`;
        const cwd = args['cwd'] ? String(args['cwd']) : '';
        const callback = (item: Widget): void => {
          shell.add(item, 'main', { ref: id });
        };
        if (state) {
          try {
            let favourites = await state.fetch(`${EXTENSION_ID}:favourites`);
            if (favourites === undefined) {
              favourites = [] as any;
            }
            model.favourites = favourites as any;
          } catch (reason) {
            console.error(`Failed to retrieve favourites data\n${reason}`);
          }
        }
        const launcher = new Launcher(
          { commands, model, cwd, callback },
          service
        );
        launcher.id = Attributes.id;
        launcher.model = model;
        launcher.title.label = Attributes.label;
        launcher.title.icon = webdsIcon;
        main = new MainAreaWidget<Launcher>({ content: launcher });
        main.id = id;
        main.title.closable = !!toArray(shell.widgets('main')).length;
        if (service) {
          service.ui.setWebDSLauncher(launcher);
        }
      }

      if (!tracker.has(main)) tracker.add(main);

      if (!main.isAttached)
        shell.add(main, 'main', { activate: args['activate'] as boolean });

      shell.activateById(main.id);

      if (labShell) {
        labShell.layoutModified.connect(() => {
          main.title.closable = toArray(labShell.widgets('main')).length > 1;
        }, main);
      }

      webdsLauncher = document.getElementById(Attributes.id);
      webdsLauncherBody = document.querySelector('.jp-webdsLauncher-body');
      if (webdsLauncher && webdsLauncherBody) {
        const iframe = document.createElement('iframe');
        iframe.style.cssText =
          'width: 0; height: 100%; margin: 0; padding: 0; position: absolute; background-color: transparent; overflow: hidden; border-width: 0;';
        iframe.onload = () => {
          iframe.contentWindow?.addEventListener('resize', () => {
            try {
              var evt = new UIEvent('resize');
              iframe.parentElement?.dispatchEvent(evt);
            } catch (e) {}
          });
        };
        webdsLauncherBody.appendChild(iframe);
        webdsLauncherBody.addEventListener('scroll', setShadows);
        webdsLauncherBody.addEventListener('resize', setShadows);
        setTimeout(function () {
          if (
            webdsLauncherBody!.scrollHeight > webdsLauncherBody!.clientHeight
          ) {
            webdsLauncher!.classList.add('off-bottom');
          }
        }, 500);
      }

      return main;
    }
  });

  let tracker = new WidgetTracker<MainAreaWidget>({
    namespace: Attributes.id
  });
  if (restorer) {
    restorer.restore(tracker, {
      command,
      name: () => Attributes.id
    });
  }

  return model;
}

export default plugin;
