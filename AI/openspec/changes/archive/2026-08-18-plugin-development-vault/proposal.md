## Why

The plugin lives in a repository of its own, and the only way to see a change to it is to have an Obsidian vault load it. This repository already links a checkout into itself as `AI/plugin`, and `plugin-verification` says outright that "the working repository is itself a usable Obsidian vault with the plugin linked into it" — but nothing anywhere says how that link is made, and the two platforms this project is developed on need different commands for it. So it is done from memory, and the one part of it that matters is the part that is easiest to leave out.

That part is git. A vault kept in a repository that tracks `.obsidian/plugins/` will follow the link, because git follows a junction and a symlink alike: a `git checkout` or a `git pull` in that vault writes *through* the link into the plugin's own sources, and `styles.css` there is source rather than build output. Making the link is one command. Not losing work to it is the rest of the procedure, and it is the half nobody writes down.

The audience is small and worth naming, because it decides what this is not. A person who *uses* the plugin installs it from Obsidian's community browser and needs none of this — that route stays exactly as [docs-obsidian.md](../../../../docs-obsidian.md) describes it. This is for the person working on the plugin, who wants a vault that always holds the build they just made rather than the release somebody published.

## What Changes

- **The procedure is written down once, for both platforms.** A section in `docs-testing.md`, beside the harness and the per-installation paths that are already described there, giving the Windows command and the Linux/macOS command for pointing a vault's `.obsidian/plugins/safelearn-formatter` at a checkout.
- **It says what to do when the vault is itself a repository**, which is the step that protects the plugin's sources: untrack what is there, ignore the directory, and only then make the link. The reason is given rather than asserted, because a person who does not know that git writes through the link will reasonably skip the step.
- **It names what has to be true before the link means anything**: a checkout with its dependencies installed and `npm run build` run at least once, because `main.js` is not committed and a vault linked to a checkout that has never been built loads nothing at all.
- **It is a guide that can be walked through rather than read.** Each step is a command with the thing it should produce, so that a person following it knows at which line it went wrong.
- **The user-facing route is left alone, and pointed at.** `docs-obsidian.md` keeps telling a reader to install from Community plugins; the new section says who it is not for, so that the two do not read as competing instructions.

## Capabilities

### Modified Capabilities

- `plugin-verification`: gains the requirement that the repository documents how a person working on the plugin points a vault at a checkout of it, on each platform this project is developed on, and that the documented procedure accounts for a vault that is itself a repository. The capability already states that a working vault has the plugin linked into it and that machine-specific locations are configuration; it says nothing about how a person arrives at either, which is why the procedure has lived in nobody's notes.

## Impact

- **`docs-testing.md`**: one new subsection under "The second run: the Obsidian plugin". It is where the plugin checkout, `SAFELEARN_TEST_PLUGIN_DIR` and the `AI/plugin` link are already explained, so the per-installation material stays in one place.
- **`docs-obsidian.md`**: at most one sentence in "Installing It", saying that somebody working on the plugin has a different route and where it is. Nothing else on that page changes — it describes the plugin as the person installing it sees it, and that person is unaffected.
- **No code, and no spec beyond the one requirement.** Nothing about what the plugin does, what the harness does, or what the server does is touched.
- **Not the plugin repository.** Its README addresses somebody reading the plugin; this procedure is about a vault in this project's working setup, and the link's path is per installation either way.
