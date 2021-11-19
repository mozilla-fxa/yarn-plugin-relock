import { WorkspaceRequiredError } from "@yarnpkg/cli";
import {CommandContext, Plugin, Configuration, Project, Cache, ThrowReport, LocatorHash, miscUtils, structUtils, Locator, Package } from '@yarnpkg/core';
import {Command} from 'clipanion';

class RelockCommand extends Command<CommandContext> {

  static paths = [['relock']]
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
              if (!pkg) {
                throw new Error(`Assertion failed: The locator should have been registered`);
              }
              return structUtils.stringifyLocator(pkg);
            },
          ])
        )
      ).filter(locatorHash => {
        if (project.storedChecksums.has(locatorHash)) {
          return false;
        }
        let pkg = project.storedPackages.get(locatorHash);
        if (pkg.conditions) {
          // skip checksums for deps with conditions
          return false;
        }
        if (pkg.reference.includes('workspace:')) {
          return false;
        }
        
        if (pkg.reference.startsWith('virtual')) {
          const nextReference = pkg.reference.slice(pkg.reference.indexOf('#') + 1)
          pkg = structUtils.makeLocator(pkg, nextReference) as Package
        }
        return !project.storedChecksums.has(pkg.locatorHash)
      });
      const fetcher = configuration.makeFetcher();
      const fetchWithRetry = async (pkg: Locator, checksums: Map<LocatorHash, string>, isRetry?: boolean) => {
        const result = await fetcher.fetch(pkg, {checksums, project, cache, fetcher, report: new ThrowReport()});
        if (result.checksum || isRetry) {
          return result
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
        return await fetchWithRetry(pkg, checksums, true)
      }
      for (const locatorHash of missingChecksumLocators) {
        let pkg = project.storedPackages.get(locatorHash) as Locator;
        if (pkg.reference.startsWith('virtual')) {
          const nextReference = pkg.reference.slice(pkg.reference.indexOf('#') + 1)
          pkg = structUtils.makeLocator(pkg, nextReference)
        }
        const result = await fetchWithRetry(pkg, project.storedChecksums);
        if (result.checksum) {
          project.storedChecksums.set(pkg.locatorHash, result.checksum);
        }
      }
    }
    catch (e) {}
    //@ts-ignore
    await project.persistLockfile()
  }
}

const plugin: Plugin = {
  commands: [
    RelockCommand,
  ],
};

export default plugin;
