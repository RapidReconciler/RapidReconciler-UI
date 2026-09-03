# Hard rules — re-injected every turn

Loaded by `Tools/hard-rules-hook.py` on `UserPromptSubmit`. These are not
guidance. Each one exists because shipping its opposite cost a working day.

Memory files load once at session start and lose force as a session grows. That
is why these live here instead: the cost of forgetting them arrives at tool call
sixty, not tool call one.

Keep this file SHORT. Every line is paid for on every turn.

---

1. **NO GUESSING.** Never conclude that something does not exist from a name you
   constructed. Any identifier in a search must have been read out of source, a
   schema, or command output first. If you inferred the name, the only valid next
   step is to look up the real one. "Not found" for an invented name is not a
   finding, it is fabricated evidence.

2. **NO BAND-AIDS.** Production-ready or explicitly labelled not production
   ready. A console command, a hand-edited localStorage key, a stub, or a
   workaround is never an answer to "how do I do X" — it is proof that X is not
   built. Say that plainly instead of handing over the workaround.

3. **VERIFY, DO NOT ASSERT.** Every written finding is a hypothesis until
   re-measured. Diff the inputs before theorising about the transport. Name the
   table, file, or command you measured. Parse-clean is not verified, and "the
   server serves it" is not "their browser runs it".

4. **CHECK YOUR OWN HARNESS FIRST.** Before reporting a reproducible failure,
   rule out contamination from the test setup. A control run that should pass,
   run last, is the cheapest way to catch it.

5. **A GATE'S MESSAGE NEEDS A SINK.** Grep the sink, not just the producer. A
   reason written to a console, or to a DOM node nobody can see, has not been
   reported. Trace it to the element and the CSS that renders it.

6. **NUMBERS THAT DRIVE A DECISION GO ON SCREEN.** If a value gates a control,
   it is printed next to that control. A tooltip is not a sink.

7. **HOLD COMMITS.** Batch into logical chunks and wait for the owner to say
   "commit". Then run the full flow end to end without pausing to ask.

7b. **NEVER `mvn package` WHILE THE SERVICE IS RUNNING.** The live JVM holds the
   fat jar open, `jar:jar` overwrites it anyway, `repackage` then fails on the
   lock, and what is left on disk is a ~2.5MB non-bootable jar the service
   cannot start from. `compile` is safe; `package` is not. Rebuild only through
   the product's own path, which stops the service first. Cost it once already,
   2026-09-01, on VALC.

8. **NEVER WRITE FILE CONTENT THROUGH A BASH HEREDOC.** Not for scripts, not for
   HTML, not for SQL, not "just this once because it is short". Use the Write or
   Edit tool. The shell eats backslash escapes and mis-parses quotes, and the
   failure is either a syntax error costing a retry or, worse, silent corruption
   of a real file. Four sessions have paid for this now.

9. **EVERY RESPONSE:** confidence (0-100) at the top, token and cost estimate at
   the bottom, Humanizer applied to deliverables, and no sugar-coating.
