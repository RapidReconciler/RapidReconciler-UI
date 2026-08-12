# The null refresh-job-name error loop

A V7 install produced a continuous stream of `ERROR` lines with no user activity
on the box. Two faults were in play; one of them drove the volume. Verified in
source 2026-08-12 against `RapidReconciler-V7-Broker` (**not**
`RapidReconciler-Agent` — the classes below do not exist in the new agent).

This is written up so a Help Desk scenario page can be authored from it. Nothing
here identifies the install: figures are from one dataset and the shapes, not the
values, are what generalize.

## The shape

- VALC holds the instance with **`databaseJobName=null`**.
- The broker's synchronize loop dereferences that null on every tick.
- The broker's job-name writer concatenates that null into a SQL string and
  re-runs the write forever.
- On that one install the pair produced roughly 5,600 `ERROR` lines across about
  17 hours. Treat the number as one specimen. What generalizes is *steady* — a
  flat rate on an idle box, not a burst at startup.

## Fault 1 — the null dereference

`SynchronizeService.java:132`:

```java
} else if (!state.getDatabaseJobName().equals(instance.getDatabaseJobName())) {
```

`state.getDatabaseJobName()` is null, so the call throws. What makes the symptom
confusing is *when* it fires:

- Line 106 takes `anyInfoDifferent(state, instance)` first, and that path handles
  a null job name safely.
- Line 132 is the `else` — it only runs when **nothing about the instance
  changed**.

So the exception does not appear at startup or after a config change. It appears
steadily on a completely idle instance, which reads like a heartbeat problem
rather than a configuration problem. The `NullPointerException` surfaces wrapped
in a `Could not interpret JMS message` line, which sends the reader toward the
messaging layer.

## Fault 2 — the null written into SQL

`DatabaseManagerServiceMsSqlImpl.java:294`:

```java
String updateScript = "UPDATE rsystemvariables SET value = '" + databaseJobName
    + "' WHERE name = 'refreshjobname'";
```

With `databaseJobName` null this writes the four-character literal `null` into
the row. Worse, the guard above it can never be satisfied:

```java
if (!storedDatabaseJobName.equals(databaseJobName)) { ... }
```

`String.equals(null)` is always `false`, so the negation is always `true`. The
write is attempted on **every scheduler tick regardless of what is stored** —
including after the row already holds the literal `null`. There is no state the
loop can reach that stops it.

Consequence depends on the database:

| Target database | Behaviour |
|---|---|
| Writable | Succeeds every tick. Wasteful, silent, no error line. |
| Read only | Throws every tick. This is the second fault, and it is what makes the loop visible in the log. |

## Diagnosis

`databaseJobName=null` in the MonitorService instance dump is the whole
diagnosis, and it is better evidence than the stack trace:

- It names the affected database directly, so you do not have to correlate a
  timestamp against anything.
- Sibling instances in the same dump show real job names, so the contrast is on
  screen in one place.

Read the dump before reading the exception. The exception names the messaging
layer; the dump names the misconfiguration.

## Fix

1. Set the refresh job name on the instance in VALC. That alone stops both loops
   — the dereference and the retry.
2. Take the target database out of read-only if it is meant to be written. That
   is a second, genuinely separate fault; fixing only the read-only flag leaves
   the literal `null` being written every tick, silently.

## Code changes worth proposing upstream

Both are in `RapidReconciler-V7-Broker`, so they are subject to whatever change
control the V7 broker is under.

- Null-safe the comparison at `SynchronizeService.java:132`
  (`Objects.equals(a, b)`).
- Parameterize the update in `DatabaseManagerServiceMsSqlImpl.java:294` and
  compare with `Objects.equals` so a null job name is a no-op instead of a
  permanent retry. Writing an unescaped value into a SQL string is a defect on
  its own, independent of the null.
