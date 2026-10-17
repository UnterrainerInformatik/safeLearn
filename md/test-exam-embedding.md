# Exam module elements
A page that places exam-module elements, for the checks in `test/checks/exam-embedding.js` (module off) and `test/exam.test.js` (module on).

Text before the element.

```safelearn-test
test: embedding-fixture-test
```

Text between the elements.

@@@ teacher
Teacher section, holding a test element and a gradebook element.

```safelearn-test
test: embedding-fixture-teacher-test
```

```safelearn-gradebook
course: embedding-fixture-course
```
@@@

An element of a kind nobody knows:

```safelearn-nosuchkind
a: b
```

The syntax, as an example inside a longer fence, stays text:

````md
```safelearn-results
course: embedding-fixture-example
```
````

Text after the elements.
