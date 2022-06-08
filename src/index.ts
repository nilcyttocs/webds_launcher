import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { MainAreaWidget } from '@jupyterlab/apputils';

import { ILauncher } from '@jupyterlab/launcher';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { launcherIcon } from '@jupyterlab/ui-components';

import { toArray } from '@lumino/algorithm';

import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

import { Widget } from '@lumino/widgets';

import { Launcher, LauncherModel } from './launcher';

namespace CommandIDs {
  export const create = 'launcher:create';
}

namespace Private {
  // eslint-disable-next-line prefer-const
  export let id = 0;
}

let webdsLauncher: any;
let webdsLauncherBody: any;
let isScrolling = false;

function setShadows(event: any) {
  if (!isScrolling) {
    window.requestAnimationFrame(function () {
      if (event.target.scrollTop > 0) {
        webdsLauncher.classList.add("off-top");
      } else {
        webdsLauncher.classList.remove("off-top");
      }
      if (Math.abs(event.target.scrollHeight - event.target.clientHeight - event.target.scrollTop) > 3
) {
  webdsLauncher.classList.add("off-bottom");
      } else {
        webdsLauncher.classList.remove("off-bottom");
      }
      isScrolling = false;
    });
    isScrolling = true;
  }
}

const EXTENSION_ID = '@webds/launcher:plugin';

const plugin: JupyterFrontEndPlugin<ILauncher> = {
  id: EXTENSION_ID,
  autoStart: true,
  optional: [ILabShell, ISettingRegistry],
  provides: ILauncher,
  activate
};

async function activate(
  app: JupyterFrontEnd,
  labShell: ILabShell | null,
  settingRegistry: ISettingRegistry | null,
): Promise<ILauncher> {
  console.log('JupyterLab extension @webds/launcher is activated!');

  const {commands, shell} = app;

  let settings: ISettingRegistry.ISettings | undefined = undefined;
  if (settingRegistry) {
    try {
      settings = await settingRegistry.load(EXTENSION_ID);
    } catch (reason) {
      console.log(`Failed to load settings for ${EXTENSION_ID}\n${reason}`);
    }
  }

  const model = new LauncherModel(settings);

  commands.addCommand(CommandIDs.create, {
    label: 'WebDS Launcher',
    execute: (args: ReadonlyPartialJSONObject) => {
      const id = `launcher-${Private.id++}`;
      const cwd = args['cwd'] ? String(args['cwd']) : '';
      const callback = (item: Widget): void => {
        shell.add(item, 'main', {ref: id});
      };

      const launcher = new Launcher({commands, model, cwd, callback});
      launcher.id = "webds-launcher";
      launcher.model = model;
      launcher.title.label = 'Launcher';
      launcher.title.icon = launcherIcon;

      const main = new MainAreaWidget<Launcher>({content: launcher});
      main.id = id;
      main.title.closable = !!toArray(shell.widgets('main')).length;

      shell.add(main, 'main', {activate: args['activate'] as boolean});

      if (labShell) {
        labShell.layoutModified.connect(() => {
          main.title.closable = toArray(labShell.widgets('main')).length > 1;
        }, main);
      }

      webdsLauncher = document.getElementById("webds-launcher");
      webdsLauncherBody = document.querySelector(".jp-webdsLauncher-body");
      webdsLauncherBody.addEventListener("scroll", setShadows);
      setTimeout(function(){
        if (webdsLauncherBody.scrollHeight > webdsLauncherBody.clientHeight) {
          webdsLauncher.classList.add("off-bottom");
        }
      }, 0);

      return main;
    }
  });

  return model;
}

export default plugin;
