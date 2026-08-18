/* ============================================================
   Demo3 (TR) sanitization — Stage 2: user/audit + remark fields
   -> generic constants. Batched (idempotent predicates) so big-table
   transactions stay small. Target: jdesource_tr.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_tr;
DECLARE @b int = 250000, @r int;

/* F9210 batch control (PRODCTL) — user/pid/job */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) PRODCTL.F9210 SET FRUSER='DEMO', FRPID='DEMO', FRJOBN='DEMO'
   WHERE FRUSER<>'DEMO' OR FRPID<>'DEMO' OR FRJOBN<>'DEMO';
  SET @r=@@ROWCOUNT; IF @r=0 BREAK; END
PRINT 'F9210 users done';

WHILE 1=1 BEGIN
  UPDATE TOP (@b) PRODDTA.F0011 SET icuser='DEMO' WHERE icuser<>'DEMO';
  SET @r=@@ROWCOUNT; IF @r=0 BREAK; END
PRINT 'F0011 icuser done';

/* F3106 — sduser/sdpid/sdjobn */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) PRODDTA.F3106 SET sduser='DEMO', sdpid='DEMO', sdjobn='DEMO'
   WHERE sduser<>'DEMO' OR sdpid<>'DEMO' OR sdjobn<>'DEMO';
  SET @r=@@ROWCOUNT; IF @r=0 BREAK; END
PRINT 'F3106 users done';

/* F43121 — pruser/prtorg/prpid + prvrmk */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) PRODDTA.F43121 SET pruser='DEMO', prtorg='DEMO', prpid='DEMO', prvrmk='Receipt'
   WHERE pruser<>'DEMO' OR prtorg<>'DEMO' OR prpid<>'DEMO' OR prvrmk<>'Receipt';
  SET @r=@@ROWCOUNT; IF @r=0 BREAK; END
PRINT 'F43121 users+remark done';

/* F0911 — gluser/gltorg + glexa/glexr (explanation kept as Demo2 parity) */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) PRODDTA.F0911 SET gluser='DEMO', gltorg='DEMO', glexa='Inventory transaction', glexr=''
   WHERE gluser<>'DEMO' OR gltorg<>'DEMO' OR glexa<>'Inventory transaction' OR glexr<>'';
  SET @r=@@ROWCOUNT; IF @r=0 BREAK; END
PRINT 'F0911 users+remarks done';

/* F4111 — iluser + iltrex */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) PRODDTA.F4111 SET iluser='DEMO', iltrex='Inventory transaction'
   WHERE iluser<>'DEMO' OR iltrex<>'Inventory transaction';
  SET @r=@@ROWCOUNT; IF @r=0 BREAK; END
PRINT 'F4111 users+remark done';

PRINT 'STAGE2_COMPLETE';
