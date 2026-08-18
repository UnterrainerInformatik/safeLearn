## ADDED Requirements

### Requirement: Pointing a vault at a plugin checkout is written down for each platform

A working vault loads the plugin from a checkout rather than from an installed copy, and how that link is made differs per platform. The repository SHALL document the procedure for each platform it is developed on, as commands that can be followed rather than as a description of the result. The documentation SHALL name what must be true of the checkout before the link means anything — that its dependencies are installed and that it has been built at least once, `main.js` not being committed.

The documentation SHALL also say who the procedure is not for: a person who uses the plugin installs it from Obsidian's community browser, and SHALL NOT be directed through a development setup to do so.

#### Scenario: A person sets up a vault to work on the plugin

- **WHEN** somebody working on the plugin wants a vault that loads what was last built
- **THEN** the repository gives them the command for their platform, and what it should produce

#### Scenario: A person only wants to use the plugin

- **WHEN** somebody who does not work on the plugin looks for how to install it
- **THEN** what they are told is to install it from the community browser, and the development procedure is marked as not being for them

### Requirement: The documented procedure protects the checkout from the vault's own repository

Where a vault is itself a repository that tracks its plugin directory, the documented procedure SHALL have that directory untracked and ignored before the link is made, and SHALL state why. The reason SHALL be given as the consequence it prevents rather than as a rule alone, so that the step is not read as tidiness and dropped.

What it prevents is this: git follows a link as if it were an ordinary directory, so an ordinary `git checkout` or `git pull` in such a vault writes through the link into the plugin's working tree, over files that are source there rather than build output.

#### Scenario: The vault is a git repository that tracks its plugins

- **WHEN** the procedure is followed in a vault whose plugin files are tracked
- **THEN** those files are untracked and the directory ignored before the link is made, and the guide has said what that prevents

#### Scenario: A pull happens in a linked vault afterwards

- **WHEN** the vault is updated from its remote after the procedure has been followed
- **THEN** nothing is written into the plugin checkout through the link
