/* ============================================================
   Demo2 (NA) sanitization — Stage 1: text scrub
   THEME: wholesale distributor  (Demo1 = industrial mfg; kept disjoint)
   Target: jdesource_na   Schema: PRODDTA (+ PRODCTL.F9210)
   Safe, independent text overwrites. Idempotent where practical.
   pfx + noun are fully disjoint from Demo1's lists, so no company
   name (pfx+noun[+sfx]) can duplicate a Demo1 or TR(=Demo1-theme) name.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_na;

/* ---- scratch schema + word lists ---------------------------- */
IF SCHEMA_ID('scrub') IS NULL EXEC('CREATE SCHEMA scrub');
IF OBJECT_ID('scrub.w') IS NOT NULL DROP TABLE scrub.w;
CREATE TABLE scrub.w (kind varchar(12), id int, w nvarchar(40), PRIMARY KEY (kind,id));

/* distributor brand prefixes — NONE appear in Demo1's word lists */
INSERT scrub.w (kind,id,w) VALUES
 ('pfx',0,'Harbor'),('pfx',1,'Crossroads'),('pfx',2,'Nationwide'),('pfx',3,'Eastbrook'),
 ('pfx',4,'Westfield'),('pfx',5,'Fairland'),('pfx',6,'Bridgeport'),('pfx',7,'Clearwater'),
 ('pfx',8,'Grandview'),('pfx',9,'Oakmont'),('pfx',10,'Silverline'),('pfx',11,'Brightway'),
 ('pfx',12,'Kingsway'),('pfx',13,'Parkside'),('pfx',14,'Lakeshore'),('pfx',15,'Greenfield'),
 ('pfx',16,'Tristate'),('pfx',17,'United'),('pfx',18,'Premier'),('pfx',19,'Metro'),
 ('pfx',20,'Coastal'),('pfx',21,'Heartland'),('pfx',22,'Frontier'),('pfx',23,'Evergreen');

/* wholesale/distribution nouns — disjoint from Demo1's mfg nouns */
INSERT scrub.w (kind,id,w) VALUES
 ('noun',0,'Distribution'),('noun',1,'Wholesale'),('noun',2,'Supply'),('noun',3,'Trading'),
 ('noun',4,'Distributors'),('noun',5,'Provisions'),('noun',6,'Merchants'),('noun',7,'Logistics'),
 ('noun',8,'Wholesalers'),('noun',9,'Traders'),('noun',10,'Imports'),('noun',11,'Marketing'),
 ('noun',12,'Products'),('noun',13,'Goods'),('noun',14,'Sales'),('noun',15,'Exchange');

INSERT scrub.w (kind,id,w) VALUES
 ('sfx',0,'Inc.'),('sfx',1,'LLC'),('sfx',2,'Corp.'),('sfx',3,'Ltd.'),('sfx',4,'Co.'),('sfx',5,'Group');

/* distributor facility types (kept <=30 with an 11-char place) */
INSERT scrub.w (kind,id,w) VALUES
 ('site',0,'Distribution Ctr'),('site',1,'Warehouse'),('site',2,'Fulfillment Ctr'),
 ('site',3,'Depot'),('site',4,'Cross-Dock'),('site',5,'Regional Hub');

/* place names — fresh set, disjoint from Demo1's places */
INSERT scrub.w (kind,id,w) VALUES
 ('place',0,'Northpoint'),('place',1,'Southbridge'),('place',2,'Eastway'),('place',3,'Westport'),
 ('place',4,'Bayview'),('place',5,'Parkland'),('place',6,'Fairmont'),('place',7,'Glenwood'),
 ('place',8,'Ridgeway'),('place',9,'Meadowbrook'),('place',10,'Sunderland'),('place',11,'Oakhaven');

/* product tier (was 'mat') */
INSERT scrub.w (kind,id,w) VALUES
 ('mat',0,'Value'),('mat',1,'Premium'),('mat',2,'Bulk'),('mat',3,'Economy'),
 ('mat',4,'Pro'),('mat',5,'Standard'),('mat',6,'Heavy-Duty'),('mat',7,'Commercial');

/* distributed product types (was 'ptype') — also flavors account descriptions in 04b */
INSERT scrub.w (kind,id,w) VALUES
 ('ptype',0,'Copy Paper'),('ptype',1,'Packing Tape'),('ptype',2,'Shipping Box'),('ptype',3,'Shrink Wrap'),
 ('ptype',4,'Pallet Wrap'),('ptype',5,'Bubble Mailer'),('ptype',6,'Utility Knife'),('ptype',7,'Storage Bin'),
 ('ptype',8,'Safety Gloves'),('ptype',9,'Cleaning Solution'),('ptype',10,'Trash Liner'),('ptype',11,'Paper Towel'),
 ('ptype',12,'Hand Soap'),('ptype',13,'Box Cutter'),('ptype',14,'Stretch Film');

/* pack sizes (was 'size') */
INSERT scrub.w (kind,id,w) VALUES
 ('size',0,'Case'),('size',1,'Pallet'),('size',2,'12-Pack'),('size',3,'24-Pack'),
 ('size',4,'Half Pallet'),('size',5,'50 ct'),('size',6,'100 ct'),('size',7,'Carton');

/* ---- F0010 company names (NA ~104 rows) ---------------------
   Curated for the licensed 6 (demo-visible) + structural anchors;
   themed generator for the rest; lease companions keep '- Leases'.
   Keyed on ORIGINAL ccco (05b remaps the code later). ------------- */
UPDATE f SET ccname =
  CASE
    WHEN RTRIM(ccco)='00000' THEN 'Cornerstone Wholesale Group'            /* group parent */
    WHEN RTRIM(ccco)='00001' THEN 'Cornerstone Distribution Corp' /* ultimate parent */
    WHEN RTRIM(ccco)='00002' THEN 'Harbor Wholesale Supply, Inc.'          /* licensed */
    WHEN RTRIM(ccco)='00003' THEN 'Crossroads Distribution LLC'            /* licensed */
    WHEN RTRIM(ccco)='00009' THEN 'Nationwide Trading Co.'                 /* licensed */
    WHEN RTRIM(ccco)='00012' THEN 'Eastbrook Provisions, L.L.C.'           /* licensed */
    WHEN RTRIM(ccco)='00022' THEN 'Grandview Distributors LLC'             /* licensed */
    WHEN RTRIM(ccco)='00041' THEN 'Silverline Supply Co.'                  /* licensed (was Sawtooth) */
    WHEN RTRIM(ccco)='00998' THEN 'Security Cost Center Company'
    WHEN RTRIM(ccco)='00999' THEN 'Model Company'
    WHEN RTRIM(ccco)='99998' THEN 'Elimination Company 2100'
    WHEN RTRIM(ccco)='99999' THEN 'Elimination Company 2170'
    WHEN RTRIM(ccco) LIKE '009%' THEN p.w + N' Leasing ' + s.w             /* lease companions (<=30) */
    ELSE p.w + N' ' + n.w + N' ' + s.w                                     /* themed generator */
  END
FROM PRODDTA.F0010 f
JOIN scrub.w p ON p.kind='pfx'  AND p.id = ABS(CHECKSUM(f.ccco,111)) % 24
JOIN scrub.w n ON n.kind='noun' AND n.id = ABS(CHECKSUM(f.ccco,222)) % 16
JOIN scrub.w s ON s.kind='sfx'  AND s.id = ABS(CHECKSUM(f.ccco,333)) % 6
WHERE RTRIM(ISNULL(f.ccname,'')) <> '';
PRINT 'F0010 ccname: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- F0101 address-book names (themed company names) --------- */
UPDATE f SET abalph = p.w + N' ' + n.w + N' ' + s.w
FROM PRODDTA.F0101 f
JOIN scrub.w p ON p.kind='pfx'  AND p.id = ABS(CHECKSUM(f.aban8, 11)) % 24
JOIN scrub.w n ON n.kind='noun' AND n.id = ABS(CHECKSUM(f.aban8, 22)) % 16
JOIN scrub.w s ON s.kind='sfx'  AND s.id = ABS(CHECKSUM(f.aban8, 33)) % 6
WHERE RTRIM(ISNULL(f.abalph,'')) <> '';
PRINT 'F0101 abalph: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- F0006 business-unit descriptions (location names) ------- */
UPDATE f SET mcdl01 = st.w + N' ' + pl.w
FROM PRODDTA.F0006 f
JOIN scrub.w st ON st.kind='site'  AND st.id = ABS(CHECKSUM(f.mcmcu, 44)) % 6
JOIN scrub.w pl ON pl.kind='place' AND pl.id = ABS(CHECKSUM(f.mcmcu, 55)) % 12
WHERE RTRIM(ISNULL(f.mcdl01,'')) <> '';
PRINT 'F0006 mcdl01: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- F4101 item descriptions (distributed goods) ------------- */
UPDATE f SET imdsc1 = m.w + N' ' + t.w + N' ' + z.w
FROM PRODDTA.F4101 f
JOIN scrub.w m ON m.kind='mat'   AND m.id = ABS(CHECKSUM(f.imitm, 66)) % 8
JOIN scrub.w t ON t.kind='ptype' AND t.id = ABS(CHECKSUM(f.imitm, 77)) % 15
JOIN scrub.w z ON z.kind='size'  AND z.id = ABS(CHECKSUM(f.imitm, 88)) % 8
WHERE RTRIM(ISNULL(f.imdsc1,'')) <> '';
PRINT 'F4101 imdsc1: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- F4096 AAI descriptions --------------------------------- */
UPDATE PRODDTA.F4096 SET fadl01 = 'Inventory AAI mapping'
WHERE RTRIM(ISNULL(fadl01,'')) <> '';
PRINT 'F4096 fadl01: ' + CAST(@@ROWCOUNT AS varchar(12));
PRINT 'STAGE1_TEXT_COMPLETE';
