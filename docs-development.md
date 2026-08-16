# Development
Here you can find what the Keycloak realm behind a development instance has to look like, so that `npm test` runs and so that the checks it runs actually prove something.

[Back](README.md) to the main page.

For what the suite does and how to run it, see [testing](docs-testing.md). For the general client setup, and for hosting SafeLearn against a school LDAP, see [keycloak](docs-keycloak.md). This page is about the realm you develop and test against.

## Such a realm has no LDAP, on purpose

A production instance takes its roles from the school's directory: `getLdapGroups` reads the `ldap` claim, pulls every `OU=…` out of it and maps `Teachers` to `teacher` and `Students` to `student`.

A development realm has none of that, and should not get it. It exists to try SafeLearn out, to show it to people and to run the suite against, its accounts are public, and its passwords are printed in `README.md`. Wiring a directory into it would give a shared open realm a dependency it has no business having.

The consequence is worth stating plainly, because it decides everything below:

> **Without LDAP, every role is a client role of the client `safeLearn`.**
> There is no `ldap` claim, so `rolesCalculated` stays empty and the LDAP source contributes nothing. What a session can be addressed by comes down to its client roles plus its own display name — the two remaining sources [permissions](docs-permissions.md) describes.

Both paths are the same code and produce the same flat role set, so a role behaves identically whichever way it arrived — a client role named `Students` is canonicalized exactly like an LDAP unit named `Students`. Developing against client roles therefore verifies the LDAP path too, apart from the claim parsing itself.

## What the realm needs for `npm test` to run at all

Without these the run fails outright rather than passing weakly. The ordinary client setup is in [keycloak](docs-keycloak.md); these are the parts the suite depends on specifically.

* **`http://localhost:8080/auth/callback` is a registered redirect URI** on the client. The port is not a free choice — SafeLearn derives the redirect URI from its server URL, so another port needs its own entry.
* **The user attribute `config` is declared in the realm's user profile and mapped into the token**, editable by the user. Every content check writes a known preference block through the account API before it asserts anything; a realm that refuses the write fails the run with `the identity provider refused the write`.
* **Every test account can log in without being interrupted.** See the next section — this is the one that bites.

### Two user-profile settings that are easy to miss on a fresh install

Both live in *Realm settings → User profile*, and both cost an afternoon of confusion if they are wrong.

**1. Every account needs an email address.** If *Email* is a required attribute, an account without one is sent to **Update Account Information** on its first login. The OIDC flow then stops at `login-actions/required-action?execution=VERIFY_PROFILE` and never reaches the application. The harness reports this as:

```
the flow never left the identity provider
```

which reads like a wrong password but is not one — the password was accepted, the profile was not. The screenshot the harness leaves in `test/.runtime/` shows which field is missing. A fake address such as `student5b@example.invalid` is enough; nobody reads that mailbox, the field only has to be non-empty.

**2. `lastName` must not be required.** This is a deliberate deviation from a default install, and it exists for exactly one account. The reserved-name guard can only be exercised by a user whose *entire* display name equals a built-in role — and since the `name` claim is `firstName + " " + lastName`, that account has to leave one of the two fields empty. With *Last name* required, it cannot log in at all, and the guard stays unverifiable.

Set *Last name* to not-required when you build the realm. It is the kind of thing that gets restored to the default on a reinstall and then quietly costs you a test.

## The accounts

Username and password are identical for every account, the way `student`/`student` already is. That is acceptable here only because none of these accounts has any privilege outside the client `safeLearn`.

### Client roles

On the client `safeLearn`, under *Roles*: `admin`, `teacher`, `examParticipant`, `4AHIF`, `4BHIF`, `5BHIF`, and — for the synthetic accounts described further down — `student`, `students`, `teachers`.

Capitalization does not matter, `hasRoles` compares everything trimmed and lowercased, but the class roles are conventionally written in capitals.

### A student holds no role, and that is the point

At a real school **no pupil carries the role `student`**. The directory has no unit that would produce it, and that is the normal case for something like 98% of all users. A student is a session that is neither `admin` nor `teacher` — nothing more.

The application already works this way: the teacher/student toggle does not grant `student`, it strips `teacher`, `teachers` and `admin`. What remains is a student.

An account with an empty role list is therefore the *most* realistic account in the realm, not the most deficient one. That is why the accounts below fall into two groups, and it matters which is which.

### Accounts that mirror production

These are what a school's directory actually produces: a teacher with classes, an administrator, pupils with a class role or with no role at all.

| USER = PASSWORD | FIRST | LAST | CLIENT ROLES | WHAT IT COVERS |
| --- | --- | --- | --- | --- |
| `student` | Stu | Dent | *(none)* | The ordinary pupil. Addressable only by display name, which is what `@@@ Stu Dent` demonstrates. |
| `teacher` | Tea | Cher | `teacher`, `examParticipant`, `4AHIF`, `Gerald Unterrainer` | Everything teacher-facing, the exam view, and a class role. The role named after a person demonstrates that a client role may carry a display name. |
| `admin` | Ad | Min | `teacher`, `admin` | The `@@@ admin` block, the admin short-circuit, and that the teacher-view downgrade takes both away. |
| `student5b` | Fuenf | Bhif | `5BHIF` | `@@@ 5bhif` and `md/test-fileperms-4bhif-5bhif-2ahif.md` from the permitted side, in the tree and by direct path. |
| `student4b` | Vier | Bhif | `4BHIF` | Isolates the 2099 window. The only entry naming this session in that directive is `4bhif[2099-…]`, so the block must stay hidden — the same block is granted to `4ahif` by an entry without a window. |

**The admin account holds `teacher` as well**, so it cannot show that `admin` *alone* grants anything: every teacher-facing block it sees, it would see without the admin role. The block that does prove the short-circuit is `@@@ 5bhif` in `md/test-perms.md` — the account holds no class role, so nothing but the short-circuit can make that block appear. Separating the two roles onto a sixth account would isolate it properly, at the cost of another login per run.

**The client role `admin` is not a Keycloak administrator.** It is a role of the client `safeLearn` and means nothing outside it. That is what makes `admin`/`admin` acceptable in an open realm — so never give that account a realm-management role, or the realm has a publicly documented administrator.

### The reserved-name account

A display name equal to a built-in role must not grant that role. Verifying it needs an account whose *whole* display name is one of `admin`, `teacher`, `teachers`, `student`, `students` — hence the empty last name, and hence the user-profile setting above.

| USER = PASSWORD | FIRST | LAST | CLIENT ROLES | WHAT IT COVERS |
| --- | --- | --- | --- | --- |
| `collision` | Admin | *(empty)* | *(none)* | The reserved-name guard. Its display name is exactly `Admin`; it must see nothing an admin sees, and the server log must carry the collision warning. |

This account is worth the deviation, because it is the only way to observe the guard against a real login. Verified against the live realm, side by side with the `admin` account that holds the role for real:

| | `collision` — named `Admin`, no roles | `admin` — holds `admin` |
| --- | --- | --- |
| `@@@ admin` block | absent | visible |
| teacher block | absent | visible |
| `@@@ 5bhif` block | absent | visible via the short-circuit |
| `md/test-fileperms-teachers.md` | refused | served |

**Careful when you put this account into the harness.** `roles(session)` in `test/harness.js` adds the display name to the role set unconditionally, which is what `hasRoles` did before the guard existed — so for this account the harness reports `admin` while the application grants nothing. Every check derives its expectation from that function, so they would all assert the opposite of the truth. `roles()` has to learn the same reserved-name rule before this account can join the generic checks.

### Accounts that exercise code paths a school does not reach

The role `student` exists in the code: an LDAP unit `Students` maps to it, and a client role of that name grants it. Another school's directory might well produce it. These two accounts hold the plural spellings so that the canonicalization can be observed at the source. They verify the code; they do not model your users.

| USER = PASSWORD | FIRST | LAST | CLIENT ROLES | WHAT IT COVERS |
| --- | --- | --- | --- | --- |
| `pluralstudent` | Plu | Ral | `students` | Canonicalization at the source: the role arrives in the plural, so `@@@ student` must still address it — and `@@@ students` must too. |
| `pluralteacher` | Plu | Rale | `teachers` | The same for the teacher side, which production *does* reach — the unit `Teachers` is real. |

Because `students` is canonicalized to `student` and the alias is projected back, `pluralstudent` ends up holding both spellings — so it also covers the `student`/`students` alias from the permitted side, and no account needs the singular role directly. Adding one would model nothing a real deployment has. The checks derive everything from `roles(session)`, so the run simply reports which side it exercised.

## What the suite does with them

`accounts` in `test/harness.js` is the list of logins the harness knows, and the content checks iterate over the roles named there — today `student` and `teacher`. An account that exists in the realm but not in that list is never logged in as, and the checks that would need it keep asserting only their denied half. Extending the list is a code change, not Keycloak work.

Weigh it against what it costs: every account in that list is one more real OIDC round-trip per run against a shared public identity provider. Adding all of them is not free, and the suite asserts its own login count precisely so that cost stays visible.

The gaps that remain because of this are recorded in [testing](docs-testing.md) under *What the corpus demonstrates but a run cannot assert*. Each of those entries expires the moment the account that closes it enters the harness — that file's rule is that an exception must not outlive its repair.

## Adding something the browser has to fetch

The server does not serve the application directory. It serves an allowlist of mounts in `app.js` — `/assets`, `/css`, `/md`, `/obsidian-page.js`, the four `logo-*.png` files, `/index.html` and the two mermaid `dist` directories — and nothing else. That is deliberate: `keycloak.json` carries the OIDC client secret and has to sit next to `app.js` in every deployment, because that is where the application reads it from. A file that is merely present must not become a URL.

So when you add a stylesheet, a script, a font or a browser-side module and reference it from a rendered page, **it will not be served until you give it its own mount**. What you see is not a 404: the catch-all at the bottom of `app.js` redirects anything unmatched to the start page, so the browser gets 200 and a page nobody asked for, and the console complains about a stylesheet that arrived as HTML.

The fix is one line next to the other mounts:

```js
app.use("/your-prefix", checkAuthenticated, express.static(path.join(__dirname, "your-directory")));
```

Mount the narrowest thing that covers the reference rather than widening an existing mount, and keep the URL prefix the same as the one the page emits so nothing else has to change. `npm test` catches the omission for you: `test/checks/deployment-surface.js` walks every same-origin reference of a rendered page in all three views and fails on a reference that falls through to the start page.
