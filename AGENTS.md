# AppReel

## Versioning

Every release bumps the **patch** number, whatever it contains, unless it is a major update:

- `0.1.1` → `0.1.2` → … → `0.1.9`
- after `x.y.9` the next release is `x.(y+1).0`, never `x.y.10`: `0.1.9` → `0.2.0`
- the minor number only ever moves by rolling over from `.9`, never on its own for a feature
- a **major** update (a breaking change to the installed tooling, a flow's scenario/`record.mjs`
  contract, or the `.appreel/` layout) bumps the major number: `x.y.z` → `(x+1).0.0`

Set the version with `npm version <x.y.z> --no-git-tag-version`, which updates `package.json` and
`package-lock.json` together.
