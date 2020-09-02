import { WorkspaceRequiredError } from "@yarnpkg/cli";
import {CommandContext, Plugin, Configuration, Project, Cache, ThrowReport} from '@yarnpkg/core';
import {Command} from 'clipanion';

class RelockCommand extends Command<CommandContext> {

  @Command.Path(`relock`)
  async execute() {
    const configuration = await Configuration.find(
      this.context.cwd,
      this.context.plugins
    );
    const { project, workspace } = await Project.find(
      configuration,
      this.context.cwd
    );

    if (!workspace) {
      throw new WorkspaceRequiredError(project.cwd, this.context.cwd);
		}
    const cache = await Cache.find(configuration)
    await project.resolveEverything({
      cache,
      report: new ThrowReport()
    })
    await project.persistLockfile()
  }
}

const plugin: Plugin = {
  commands: [
    RelockCommand,
  ],
};

export default plugin;
