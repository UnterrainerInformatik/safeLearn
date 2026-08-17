## Purpose

Defines the language this repository is written in, which of its contents the rule covers, and which are deliberately exempt. SafeLearn exists to be forked and run by other schools, so a person meeting this source for the first time is the reader every part of it is written for.

## ADDED Requirements

### Requirement: The source is written in English

Source files SHALL be written in English — identifiers, comments, log messages and the strings the application emits to a developer. A contributor who does not speak the maintainers' language SHALL be able to read the source without translating it.

#### Scenario: A comment is added

- **WHEN** a comment is written in a source file
- **THEN** it is English, whatever language the change was discussed in

#### Scenario: A reader meets a non-obvious function

- **WHEN** a function's behavior is not evident from its code
- **THEN** the commentary that explains it is in the same language as the rest of the source

### Requirement: The project's documentation is written in English

The documentation files a fork inherits — the readme and the `docs-*` set — SHALL be English, for the same reason and the same reader.

#### Scenario: Documentation is extended

- **WHEN** a documentation file gains a section
- **THEN** it is English and reads as part of the document it was added to

### Requirement: What the rule does not cover is named

The convention SHALL state its exemptions rather than leaving them to be inferred, so that a contributor meeting another language in this repository can tell an exception from a mistake. The exemptions are the teaching material in `md/`, which is written in the language it is taught in; hand-written change requests and their archived originals, which are kept in the author's own words; and conversation between contributors.

#### Scenario: A contributor finds German in the corpus

- **WHEN** a contributor reads a corpus file that is not English
- **THEN** the convention tells them this is intended, because the corpus is teaching material rather than source

#### Scenario: A change request is archived

- **WHEN** a hand-written proposal is moved into the change archive
- **THEN** its wording is preserved as written, in whatever language it was written in

### Requirement: The convention is stated where a contributor is told things

The rule SHALL be recorded in the project's contributor documentation — the set a person reads before touching the source — and not only in an analysis of the codebase or in tooling configuration, where it would read as an observation about the repository rather than as an instruction.

#### Scenario: The repository is forked

- **WHEN** someone forks the repository and looks for how to contribute to it
- **THEN** they find the language rule in the documentation they received with the fork

#### Scenario: A rule is recorded in more than one place

- **WHEN** the convention is also mentioned in a document describing the codebase
- **THEN** that mention points at the contributor documentation rather than restating the rule, so the two cannot drift apart
