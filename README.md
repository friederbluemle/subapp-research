# subapp-research

Re-exploring how to implement subapp for a micro-frontend design.

## Intro

Some basic re-considerations and requirements:

1. A single source of truth where subapps are declared.
2. A single webpack pass to process and build subapps. No longer need a separate step to discover them to pass the info to webpack.
3. Default typescript as primarily implementation language.
4. Easy and simple to develop subapps independently and publish them as modules.
5. Explicit APIs for declaring and adding features to subapps.

Technical solutions explored to solve some of the things above:

1. Use dynamic import to create subapp bundles.
2. Use a webpack plugin to statically analyze source AST to find out subapps declarations.
3. TypeScript as default language
4. Implement additional features as separate modules with APIs that the subapp can call to add features to itself.

## Working on this

Packages are kept locally for experimentation and they are not publish.

To handle the npm workflow locally, [fyn] must be used.

[fyn]: https://www.npmjs.com/package/fyn
