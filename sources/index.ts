import { WorkspaceRequiredError } from "@yarnpkg/cli";
import {CommandContext, Plugin, Configuration, Project, Cache, ThrowReport, LocatorHash, miscUtils, structUtils} from '@yarnpkg/core';
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

    // fetch packages with missing checksums
    try {
      const missingChecksumLocators = Array.from(
        new Set(
          miscUtils.sortMap(project.storedResolutions.values(), [
            (locatorHash: LocatorHash) => {
              const pkg = project.storedPackages.get(locatorHash);
              if (!pkg)
                throw new Error(`Assertion failed: The locator should have been registered`);

              return structUtils.stringifyLocator(pkg);
            },
          ])
        )
      ).filter(lh => !project.storedChecksums.has(lh));
      for (const locatorHash of missingChecksumLocators) {
        const pkg = project.storedPackages.get(locatorHash);
        const fetcher = configuration.makeFetcher();
        const result = await fetcher.fetch(pkg, {checksums: project.storedChecksums, project, cache, fetcher, report: new ThrowReport()});
        if (result.checksum) {
          project.storedChecksums.set(pkg.locatorHash, result.checksum);
        }
      }
    }
    catch (e) {}

    await project.persistLockfile()
  }
}

const plugin: Plugin = {
  commands: [
    RelockCommand,
  ],
};

export default plugin;
