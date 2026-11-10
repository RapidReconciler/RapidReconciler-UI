# Onboarding a new V8 client: the real flow, and how the walkthroughs compare

Written 2026-11-09 for the owner. Built from the code on `main` (RapidReconciler-Valc `7072929`, RapidReconciler-UI `f671100`) and from GSI's own docs, not from memory. Where a finding comes from reading code rather than running it, it says so.

The flow comes first, grouped by phase. Each step says who does it, where, what it needs, and what done looks like. After it come a side-by-side of the two walkthroughs and the gap list, worst first, each with a recommended fix.

Two items already in hand are folded in, not re-reported: AI plan and SSO on Create Client (being built, defaults Full and Entra), and the practice domain and IP fix (VLC-268).

**Status, 2026-11-10.** Three Valc PRs merged after this was written, and the VALC jar rebuilt at 21:53 UTC on 2026-11-09 contains all three. None has been seen live yet.
- #713 (VLC-270): the practice database borrows a live broker on Dev and QA. This addresses gap 1.
- `75dd3b4` (VLC-267): Back never jumps ahead, a result step keeps its instructions, and a skipped band says why. This addresses gaps 6 and 13.
- #715 (VLC-268, VLC-269): the practice client gets this box's real domain; Create Client takes the AI plan and SSO; the import reads SSO and the RR Administrator. This addresses gaps 5 and 12 and the two folded-in items.

Gaps 2, 3, 4, 7 to 11 and 14 to 16 are untouched by those PRs.

---

## Part 1. The flow, end to end

### Phase A. Sale to signed contract (no VALC screen)

1. **Qualify the prospect, with an optional proof of concept.**
   - Who: GSI Sales. A PoC install also needs the customer's IT, an RR DBA and an RR network tech.
   - Where: `sales-client-management.html` steps 1 and 2.
   - Done when: the customer decides to buy.

2. **Send the provisioning document.**
   - Who: Sales.
   - Where: `rr-provisioning.html`, which is customer-facing. It covers servers, the SQL Server version and edition, sizing, network and accounts.
   - Done when: the customer has sized their servers.

3. **Sign the contract.**
   - Who: Sales and the customer, using the MSA and Order Form in DocuSign.
   - What it settles: the licensed modules, the number of company licenses, the AI tier and whether SSO is included. VALC needs every one of these later.

4. **Hold the discovery call.**
   - Who: Sales, the RR DBA, the RR network tech and the customer's IT.
   - Note: the sales workflow and `rr-provisioning` include this call. Using VALC says it is "not required". The docs disagree (gap 15).

### Phase B. Create the client in VALC

5. **Create the client.**
   - Who: GSI.
   - Where: Clients › V8 clients › **Create Client**.
   - Fields:
     - Client Name and Primary Contact email (Contact 1) are required.
     - Company Licenses, or Unlimited.
     - RR Administrator name and email (Contact 2): optional now, required at go-live.
     - Licensed modules: Inventory is pre-ticked; In Transit and PO Receipts are optional.
   - Defaults set by the server: license term from today for one year, AI tier **off**, SSO off.
   - Done when: the client's band appears in the V8 list. Its setup step is NEW.

6. **Send the installation-prep document.**
   - Who: GSI. The docs say Sales sends it, and VALC also has a **Send prep** button.
   - Where: Manage Client › Client Details › **Send prep**. It emails `rr-installation-prep` to Contact 1.
   - Done when: Install Progress shows "Installation prep received" as amber (sent, waiting).

### Phase C. The customer prepares

7. **Prepare the servers.**
   - Who: the customer's IT and DBA. The JDE owner supplies the JDE details.
   - Where: their own servers, following `rr-installation-prep.html`.
   - What it covers:
     - Windows Server 2019 or later.
     - SQL Server 2019 or later, Standard edition or higher, Mixed mode.
     - SQL Agent set to start automatically.
     - CLR enabled.
     - An SSISDB catalog, with its master key backed up.
     - A sysadmin install login GSI can use.
     - A Windows account for the SSIS proxy.
     - Firewall rules and the outbound hosts.
     - The browser and proxy permissions.
   - Done when: the customer can tick the prep checklist.

8. **Submit the installation prep.**
   - Who: the customer.
   - Where: the form in `rr-installation-prep`. It builds an email to rrsupport@getgsi.com.
   - What it carries: topology, source platform, server names and internal IPs, the checklist, JDE connection details, who submitted it, and the RR Administrator's name and email.
   - What it does not carry: SSO values (those go by a secure channel) and anything about AI.
   - Done when: the email reaches rrsupport.

### Phase D. Enter the customer's setup

9. **Client Details.**
   - Who: GSI.
   - Where: Manage Client › Client Details › **Import from email**, then **Parse & Fill**.
   - The import fills: Client Name, Contact 1 (only if empty), source platform and table qualifier, the topology, the server cards, and the JDE Source card.
   - **The import does not fill:** Contact 2 (gap 5), license dates, modules, AI tier or SSO. Set those by hand. The AI tier (off, docs, scrubbed, full) and the SSO add-on are both on this tab today.
   - Then click **Save & Next: Topology**.
   - Done when: setup moves to DETAILS_DONE.
   - Watch out: this tab's dot is green from the moment the client is created, because it only checks Contact 1 (gap 16).

10. **Topology.**
    - Who: GSI.
    - Where: Manage Client › Topology.
    - What to set:
      - Confirm the configuration: 1 is co-located, 2 has separate database and application servers.
      - Check the Application Server card: Label, internal IP and **Domain URL**.
      - Check the JDE Source card.
    - Then click **Save & Next: Install Prep**.
    - Done when: the Topology dot is green. The dot needs the Domain URL, but the Save button does not.

11. **Create the DNS record.**
    - Who: GSI IT.
    - Where: outside VALC. The record points the Domain URL at the App Server's internal IP.
    - Done when: Install Progress shows **Domain resolves to app server** green.

### Phase E. Agent install

12. **Generate the agent installer.**
    - Who: GSI.
    - Where: Manage Client › Agent Installer › **Generate agent installer**.
    - Needs: an App Server row with a usable Domain URL.
    - What happens: VALC builds one signed setup `.exe` that carries the agent's identity and no passwords. It emails Contact 1 a download link that lasts 7 days.
    - Done when: the **Agent installer ready** panel shows who the link went to and the email that was sent.

13. **Run the installer.**
    - Who: the customer's IT.
    - Where: on the application server, run as an administrator. It installs the "Rapid Reconciler 8 Agent" Windows service.
    - Done when:
      - Install Progress shows **Agent reachable** green, meaning a heartbeat under 90 seconds old.
      - The agent's own rows appear: SQL Server reachable, SQL Agent running, drive space and others.

### Phase F. Install the database

GSI does all of this phase, in the Deployment Center.

14. **Start the database.**
    - Where: Manage Client › Databases › **Add Database**. It does not register anything there: it opens Deployment Center › Manage database with this customer picked and **+ New database** selected.

15. **Readiness Check.**
    - Where: band 2.
    - What happens: opening the band runs the checks once. Confirm the rows VALC cannot test itself.
    - Done when: every "Required to install" row is green.
    - Readiness is not enforced before Install, but it should be done first.

16. **Install a Database.**
    - Where: band 3.
    - What to do:
      - Type the sysadmin install login. It is never stored.
      - Keep the name `RapidReconciler_Prod_V8`.
      - Pick the install release.
      - Click **Build**, **Test**, then **Deploy**.
    - What Deploy does: creates the database, publishes the schema, creates `rruser`, and registers the database with VALC.
    - Done when: the band is green.
    - Watch out: the new database does not appear in Step 1, and the bands below stay empty, until the page is reloaded (gap 9).

17. **Run Script 4 to create the SSIS proxy.**
    - Who: the customer's sysadmin.
    - What it does: `4 - RapidReconciler SQL Agent Job Creation Script.sql` creates the RapidReconciler SSIS proxy.
    - Order: Check SSIS later requires that `rruser` can use the proxy, so the script has to run after step 16. No page or customer doc says so (gap 10).

18. **Services.**
    - Where: band S.
    - What it does: deploys a Services release to the new database through the customer's broker, which is the agent from step 13.
    - Done when: the database's Services lane reads current, and the database shows Online on the Databases tab.

19. **SSIS Package Deploy.**
    - Where: band 4.
    - What to do:
      - Confirm the SQL Server Agent check passes.
      - Click **Check SSIS**. It checks CLR, SSISDB, SQL Agent and the proxy from step 17.
      - Pick the package release and click **Deploy package**.
    - Done when: the band is green.

20. **SSIS Environment build.**
    - Where: band 5.
    - What to do: click **Build environment**, which reads JDE decimals and line types, then **Validate**.
    - Done when: the environment shows complete.

21. **Bootstrap and Licensing.**
    - Where: band 6.
    - What to do: click **Bootstrap companies**, which reads the company list and period cutoffs (16 periods by default), then tick the companies to license.
    - Done when: the companies are listed.

22. **Load Staging Data.**
    - Where: band 7.
    - What to do: click **Load Data**, choosing Serial or Faster.
    - Done when: every table shows done.

23. **SQL Agent Job Schedule.**
    - Where: band 8.
    - What to do: set the run time and tick **Schedule enabled**. **Run refresh now** is optional.
    - Done when: the schedule is enabled.

### Phase G. Licensing and go-live

24. **Check every database is Online.**
    - Who: GSI.
    - Where: Manage Client › Databases.
    - Done when: the tab's dot is green.

25. **License the company numbers.**
    - Who: GSI.
    - Where: Manage Client › Licensing.
    - What to do: for each database, tick the purchased companies. **Check JDE for more companies** scans for any that are missing.
    - Note: the seat count is advisory only and nothing enforces it. This repeats band 6's licensing table (gap 4).
    - Done when: at least one company is licensed.

26. **Wait for company data.**
    - Where: Install Progress.
    - Done when: **Company data has loaded** is green.

27. **Go-live handoff.**
    - Who: GSI.
    - Where: Manage Client › RR Team › **Send welcome email & go live**.
    - Needs: Contact 2 on file, and company data loaded. The server checks only Contact 2.
    - What it does:
      - Creates the RR Administrator as a Power User on every database.
      - Emails a set-password link that lasts 7 days.
    - Done when: the card reads "Handed off". The client is marked live only if the email was queued or stubbed. A refused email leaves the client **not** handed off (gap 3).

28. **The customer's administrator takes over.**
    - Who: the customer's RR Administrator.
    - What they do: set their password, configure each company, add users and walk the pre-launch checklist (`administrator-start-here`).
    - GSI's part: confirm they signed in. On the very first V8 go-live, also turn on the inactivity sweep, which is a config change with no screen.

29. **Single sign-on, if they bought it.**
    - Who: GSI, with the customer's IT.
    - Where: Manage Client › SSO.
    - What to set: protocol (SAML, OIDC or Entra), the identity provider's values, email domains and default role.
    - Not required for go-live, and neither walkthrough covers it.

---

## Part 2. Where each walkthrough sits in that flow

| Real step | Onboard a new client (Clients page) | Install a customer database (Deployment Center) |
|---|---|---|
| 5 Create Client | Step 1 | |
| 6 Send prep | not covered | |
| 7 to 8 Customer prepares and submits | covered by a pasted sample | |
| 9 Client Details and import | Step 2 | |
| 10 Topology | Step 3 | |
| 11 DNS record | not covered (fixed practice domain, VLC-268) | |
| 12 Generate installer | Step 4 | |
| 13 Agent reports in | Step 5 (simulated heartbeat) | |
| 14 Add Database | Step 6, with the wrong instructions (gap 2) | Step 1 |
| 15 Readiness | | Step 2 |
| 16 Install | | Step 3 |
| 17 Script 4 | not covered | not covered (gap 10) |
| 18 Services | | skipped, with a reason (gap 6) |
| 19 to 23 SSIS, Bootstrap, Load, Schedule | | Steps 4 to 8, which cannot run on the practice client (gap 1) |
| 24 Databases Online | not covered | |
| 25 Licensing | Step 7 | (band 6 licenses too) |
| 26 Company data | simulated in Step 8 | |
| 27 Handoff | Step 8 | |
| 29 SSO | not covered | |

So the real process is one line, but the walkthroughs cut it in two at the wrong place. Onboard runs steps 5 to 13, jumps to 25 to 27, and fakes everything in between. Install covers 14 to 23 and sits on another page, and nothing in Onboard sends you there.

---

## Part 3. Gaps, worst first, with a fix for each

### 1. Install walkthrough steps 4 to 8 cannot run on the practice client

Every band after Install a Database sends its SQL through the customer's broker: SSIS Package Deploy, Environment build and Validate, Bootstrap, Load and Schedule. `BrokerCommandService` refuses unless the client has a live broker connection: "The customer's broker is not connected to VALC". The local executor that used to run this SQL from VALC's own box was retired in VLC-151, so nothing else can.

The practice client has **0** broker connections, measured in VALC's `agent_connections` table today. As a control, client 1 has one, last seen 14:22 UTC. Simulate heartbeat only stamps the server row; it does not make a broker. So the rehearsal stops being possible after step 3.

I worked this out from the code and the table. I did not run it, and nobody has: VLC-253's install rehearsal row is still open.

**Recommended fix:** decide what the practice client is for. Then either:
- (a) on Dev and QA, let the practice database borrow the box's live broker, the same way it already borrows a JDE source (Practice data); or
- (b) end the practice rehearsal at Install and show steps 4 to 8 as "read only on the practice client", with the reason on the band.

I recommend (a). Without it, juniors never touch the bands that take most of an install, and those are the bands most likely to go wrong at a real customer. This is a design decision for you.

**Status 2026-11-10:** option (a) merged as #713 (VLC-270), in the 2026-11-09 21:53 UTC build. Not yet rehearsed live.

### 2. Onboard step 6 gives the wrong instructions and strands the user

The step says Add Database "offers one database, `RapidReconciler_Prod`" and to "pick" it. In fact the button leaves the Clients page for Deployment Center › Manage database with + New database selected, where the practice database is called `RapidReconciler_Practice`.

Onboard's coaching does not follow you to that page. It resumes only when you come back to Clients. Nothing tells the user that the database is made by a second walkthrough, or that they need to click **Walk me through this** on Manage database to get it.

**Recommended fix:** make Onboard step 6 "Install the database" and give it a button that opens `/valc/deployment?walk=install`. When the Install walkthrough finishes, offer "Back to onboarding", which opens `/valc/clients?walk=onboard` and resumes at Licensing. Rewrite the step text to match.

### 3. Onboard step 8 cannot finish on this VALC

The handoff marks the client live only if the welcome email was queued or stubbed. A refused email leaves the client "NOT marked handed off" (`GoLiveHandoffService`). This dev VALC already refused the practice installer email under its nonproduction recipient rules, as your screenshot showed. The welcome email goes to `sofia.bianchi@mauromfg.example.com`, which should be refused the same way, so step 8 would never tick. This is inferred from that refusal; I have not run a handoff.

**Recommended fix:** for the practice client only, treat the welcome email as delivered on screen. The page already shows the practice sign-in link and the email body. Stamp the client handed off and say "not emailed: this is the practice client". The alternative is to add `mauromfg.example.com` to the nonproduction allow list, but that would send real mail to an address that does not exist.

### 4. Onboard licenses companies before the data exists, and licensing lives in two places

In the real flow, companies come from Bootstrap (band 6), which reads them from JDE, and band 6 has its own licensing table. Onboard step 7 asks for licensing straight after the database is registered, before any bootstrap. It even warns that "Check JDE for more companies" may fail on the practice client, for the broker reason in gap 1. Step 8 then fakes the load with **Simulate company data**.

**Recommended fix:** once gap 2 hands the user to the Install walkthrough, let Bootstrap's licensing table do the licensing. Onboard's Licensing step then becomes "check the licensed companies", or goes. Separately, pick one place to license companies. The two screens write to the same tables by different routes, and a junior will not know which one counts.

### 5. The import never fills the RR Administrator, but go-live needs it

The prep form collects the RR Administrator's name and email, and Using VALC says the import stores them as Contact 2. The parser has no pattern for that section: 0 matches for "ADMINISTRATOR" in `install-email-parser.js`, against 1 for "SUBMITTED". The handoff refuses without Contact 2. The practice client hides this because its Contact 2 is pre-filled.

**Recommended fix:** parse the "RAPIDRECONCILER ADMINISTRATOR" block into Contact 2 when Contact 2 is empty. Add it to the parser's test cases.

**Status 2026-11-10:** merged as #715 ("the import reads SSO and the RR Administrator"), in the 21:53 UTC build. Not yet seen live.

### 6. Skipped work is not visible during coaching

The Install list's "Not in this walkthrough" note, which explains why Services and Database release are skipped, sits inside a hidden container that nothing displays. So does the "no practice client" note. That is why the Services question came up.

**Merged** as `75dd3b4` (VLC-267), in the 21:53 UTC build: the Services band reads "Skipped in this walkthrough: the practice client has no broker…" while coaching. With #713 giving the practice database a broker, check on the rebuilt VALC whether Services should still be skipped at all.

**Recommended fix:** the same label for the Database release band, and a visible line on the button when no practice client exists. The button change is also done.

### 7. Done-when lines that do not match what ticks the step

- Install step 5 says "Done when the environment is built and Validate passes". It ticks on Build alone; Validate plays no part.
- Install step 8 offers "Or click Run refresh now". Run refresh now does not tick the step: only an enabled schedule does.

A junior who follows the words will wait for a tick that never comes.

**Recommended fix:** rewrite both lines to say what actually ticks the step.
- Step 5: either make Validate part of done, or say "Validate checks it".
- Step 8: drop the "Or".

### 8. Install step 4 can tick without deploying anything

Once `RapidReconciler_Practice` exists and is picked, the Package Deploy band is hidden, and a hidden band counts as done.

**Recommended fix:** for the practice database, tick step 4 from the package version row, not from the band being hidden.

### 9. A new database does not appear until you reload

After Deploy on + New database, the Step 1 drawer, the database lists and bands 4 to 8 stay in their "pick a database" state, because they only reload when the customer changes. The walkthrough does not mention this. This is also why the step 4 card had nowhere to sit in your screenshot.

**Recommended fix:** after a successful Deploy, refresh Step 1 and select the new database, the same way a manual pick does.

### 10. Script 4 has no place in the flow

Check SSIS (band 4) requires the RapidReconciler SSIS proxy, and that `rruser` can use it. The customer's sysadmin creates the proxy with Script 4, which has to run after Install creates `rruser`. No customer doc says how they get Script 4 or when to run it. The Readiness band does not ask for it, and neither walkthrough mentions it.

**Recommended fix:**
- Add a line to install step 4's card: "Check SSIS needs the SSIS proxy from Script 4; the customer's sysadmin runs it after Install."
- Add a "when GSI asks, after the database is installed" step to `rr-installation-prep`, which is customer-facing, so that one is your call.

### 11. Onboard steps 1 to 3 hide decisions a junior has to make on a real client

- Step 1 says "read what a new client needs", but the form is filled in and locked.
- Step 2 says "check the contacts, modules and company limit". It does not mention the license term, the AI tier or the SSO add-on, all on that tab.
- Step 3 says to leave the JDE Source card empty, which a real client must never do.

**Recommended fix:** add one line to each step on what to do differently for a real customer. In step 2, name the AI tier and the SSO add-on, which gain defaults with the Create Client change being built.

### 12. The DNS record and the domain check are never explained

The real flow has GSI IT create the DNS record (step 11), and Install Progress checks it. Onboard has no step for it. The practice client uses a fixed domain, which VLC-268 corrects.

**Status 2026-11-10:** VLC-268 merged as #715, in the 21:53 UTC build. The line below is still not in the walkthrough.

**Recommended fix:** add a line to Onboard step 4 or 5: "Domain resolves to app server should be green; at a real customer, GSI IT creates this record."

### 13. The installer step said "nobody to send it to"

VALC actually tries to email the link and shows the email. On this VALC it was refused.

**Merged** as `75dd3b4` (VLC-267), in the 21:53 UTC build: the step waits for Next step, outlines **Agent installer ready**, and tells the user to read the email.

### 14. Steps a real onboarding has that neither walkthrough shows

- Send prep (step 6).
- The customer's preparation (steps 7 to 8).
- Databases Online (step 24).
- The administrator's first sign-in (step 28).
- SSO (step 29).

**Recommended fix:** these do not all need steps. Mention them in one place, a short "what happens at a real customer" note on the Practice client panel, so a junior knows they exist.

### 15. The docs disagree with each other and with VALC

The tech workflow (`tech-client-management.html`) still describes the V7 model: an install zip, four scripts, a two-hour meeting and a 13-step procedure. Using VALC disagrees with VALC on several points:

- It says the import fills Contact 2.
- It uses old tab names: Install, User Accounts and Companies.
- It numbers Deployment Center steps differently.
- It puts the login in step 2.
- Its sample submission still carries a data dictionary section.
- Its flowchart says "DB team runs SQL scripts".

The docs also disagree with each other on two points:

- Whether there is a discovery call.
- Whether there is an install meeting.

Separately, VALC's own prep email claims the checklist covers certificates, and it does not.

**Recommended fix:**
- One pass that makes Using VALC match the screens.
- Retire, or mark as V7, the tech workflow page.
- A ruling from you on the discovery call and the install meeting, so the customer-facing docs say one thing.

### 16. Small wording traps

- The Client Details dot is green straight after Create, so it looks done before anything is saved.
- The App server check's help still says the row "auto-populates from first heartbeat". It no longer does.
- Licensing says "up to their limit", but nothing enforces the limit.

**Recommended fix:**
- Base the Client Details dot on the first save.
- Correct the help text.
- Either enforce the seat count or say it is advisory.
