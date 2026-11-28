## MODIFIED Requirements

### Requirement: School years, classes and courses can be renamed

A teacher SHALL be able to rename a school year, and a course of a class they see, at the record's own page head. Only a session acting as an admin SHALL be able to rename a class. The same rules as on creation SHALL apply: a school year's name SHALL be unique, a class's name SHALL be unique within its school year, and a course's subject SHALL be unique within its class. A refused name SHALL be shown at the field and leave the stored name unchanged. Renaming SHALL NOT change any result, roster entry, teacher entry, test or grade.

#### Scenario: Correcting a subject

- **WHEN** a teacher renames the course `WMx` of `4BHIF` to `WMC`
- **THEN** the bar, the class page and the gradebook show `WMC`, and every result of the course is unchanged

#### Scenario: A duplicate class name

- **WHEN** an admin renames `4AHIF` to `4BHIF` in a year that already has `4BHIF`
- **THEN** it is refused at the field and the class keeps its name

#### Scenario: A teacher tries to rename a class

- **WHEN** a teacher entered in `4AHIF` but not acting as an admin tries to rename it
- **THEN** the class page offers no rename field, the route answers `403`, and the class keeps its name

### Requirement: Records are deleted only while nothing depends on them

A teacher SHALL be able to delete a school year that has no classes and is not the current year, and a course of a class they see that has no gradebook columns, no recorded results or grades, and no tests. Only a session acting as an admin SHALL be able to delete a class, and only one that has no courses. Deleting a class SHALL remove its roster and its teacher entries. Deleting SHALL be confirmed by the module's two-click confirmation. A deletion that is not allowed SHALL be refused with the reason, shown at the delete button, and SHALL change nothing.

#### Scenario: An empty course

- **WHEN** a teacher deletes a course created by mistake that has nothing recorded
- **THEN** it is gone from the class page and from the bar

#### Scenario: A course with results

- **WHEN** a teacher tries to delete a course with one recorded result
- **THEN** it is refused, the reason names what still depends on the course, and nothing changes

#### Scenario: The current year

- **WHEN** a teacher tries to delete the current school year
- **THEN** it is refused

#### Scenario: A teacher tries to delete a class

- **WHEN** a teacher who is not an admin tries to delete an empty class they are entered in
- **THEN** the route answers `403` and the class is unchanged
