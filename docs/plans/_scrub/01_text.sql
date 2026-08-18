/* ============================================================
   Demo sanitization — Stage 1: text scrub (themed industrial mfg)
   Target: jdesource_dev   Schema: PRODDTA (+ PRODCTL.F9210)
   Safe, independent text overwrites. Idempotent where practical.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_dev;

/* ---- scratch schema + word lists ---------------------------- */
IF SCHEMA_ID('scrub') IS NULL EXEC('CREATE SCHEMA scrub');
IF OBJECT_ID('scrub.w') IS NOT NULL DROP TABLE scrub.w;
CREATE TABLE scrub.w (kind varchar(12), id int, w nvarchar(40), PRIMARY KEY (kind,id));

INSERT scrub.w (kind,id,w) VALUES
 ('pfx',0,'Apex'),('pfx',1,'Summit'),('pfx',2,'Vanguard'),('pfx',3,'Precision'),
 ('pfx',4,'Atlas'),('pfx',5,'Meridian'),('pfx',6,'Pioneer'),('pfx',7,'Keystone'),
 ('pfx',8,'Ironclad'),('pfx',9,'Titan'),('pfx',10,'Crestline'),('pfx',11,'Northgate'),
 ('pfx',12,'Vertex'),('pfx',13,'Sterling'),('pfx',14,'Granite'),('pfx',15,'Beacon'),
 ('pfx',16,'Cascade'),('pfx',17,'Monarch'),('pfx',18,'Paramount'),('pfx',19,'Redwood'),
 ('pfx',20,'Sentinel'),('pfx',21,'Cobalt'),('pfx',22,'Dynamic'),('pfx',23,'Allied');

INSERT scrub.w (kind,id,w) VALUES
 ('noun',0,'Manufacturing'),('noun',1,'Industries'),('noun',2,'Components'),('noun',3,'Fabrication'),
 ('noun',4,'Machining'),('noun',5,'Tooling'),('noun',6,'Materials'),('noun',7,'Castings'),
 ('noun',8,'Bearings'),('noun',9,'Fasteners'),('noun',10,'Hydraulics'),('noun',11,'Composites'),
 ('noun',12,'Forgings'),('noun',13,'Assemblies'),('noun',14,'Engineering'),('noun',15,'Metalworks');

INSERT scrub.w (kind,id,w) VALUES
 ('sfx',0,'Inc.'),('sfx',1,'LLC'),('sfx',2,'Corp.'),('sfx',3,'Ltd.'),('sfx',4,'Co.'),('sfx',5,'Group');

INSERT scrub.w (kind,id,w) VALUES
 ('site',0,'Plant'),('site',1,'Warehouse'),('site',2,'Distribution Center'),
 ('site',3,'Facility'),('site',4,'Works'),('site',5,'Depot');

INSERT scrub.w (kind,id,w) VALUES
 ('place',0,'North'),('place',1,'South'),('place',2,'Central'),('place',3,'Riverside'),
 ('place',4,'Lakeside'),('place',5,'Hillcrest'),('place',6,'Eastgate'),('place',7,'Westend'),
 ('place',8,'Midfield'),('place',9,'Highpoint'),('place',10,'Fairview'),('place',11,'Brookside');

INSERT scrub.w (kind,id,w) VALUES
 ('mat',0,'Steel'),('mat',1,'Stainless'),('mat',2,'Brass'),('mat',3,'Aluminum'),
 ('mat',4,'Bronze'),('mat',5,'Nylon'),('mat',6,'Carbon'),('mat',7,'Zinc');

INSERT scrub.w (kind,id,w) VALUES
 ('ptype',0,'Hex Bolt'),('ptype',1,'Washer'),('ptype',2,'Bearing'),('ptype',3,'Bushing'),
 ('ptype',4,'Gasket'),('ptype',5,'Fitting'),('ptype',6,'Coupling'),('ptype',7,'Bracket'),
 ('ptype',8,'Spacer'),('ptype',9,'Dowel Pin'),('ptype',10,'Stud'),('ptype',11,'Lock Nut'),
 ('ptype',12,'Oil Seal'),('ptype',13,'Flange'),('ptype',14,'Retaining Ring');

INSERT scrub.w (kind,id,w) VALUES
 ('size',0,'M6'),('size',1,'M8'),('size',2,'M10'),('size',3,'M12'),
 ('size',4,'1/4 in'),('size',5,'3/8 in'),('size',6,'1/2 in'),('size',7,'No. 10');

/* ---- F0010 company names (11 rows, curated) ------------------ */
UPDATE PRODDTA.F0010 SET ccname =
  CASE RTRIM(ccco)
    WHEN '00000' THEN 'Summit Industrial Group'
    WHEN '00010' THEN 'Summit Industrial, Inc.'
    WHEN '00011' THEN 'Summit Realty Holdings'
    WHEN '00014' THEN 'Apex Aerospace Inc.'
    WHEN '00018' THEN 'Meridian Components LLP'
    WHEN '00030' THEN 'Industria de Controles SA'
    WHEN '00031' THEN 'Controles del Norte, S.A.'
    WHEN '00050' THEN 'Summit Industrial, Ltd.'
    WHEN '00051' THEN 'Summit Industrial, SAS'
    WHEN '00053' THEN 'Summit Industrial, GmbH'
    WHEN '00060' THEN 'Summit Industrial India IPL'
    ELSE 'Summit Industrial' END;
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

/* ---- F4101 item descriptions (industrial parts) ------------- */
UPDATE f SET imdsc1 = m.w + N' ' + t.w + N' ' + z.w
FROM PRODDTA.F4101 f
JOIN scrub.w m ON m.kind='mat'   AND m.id = ABS(CHECKSUM(f.imitm, 66)) % 8
JOIN scrub.w t ON t.kind='ptype' AND t.id = ABS(CHECKSUM(f.imitm, 77)) % 15
JOIN scrub.w z ON z.kind='size'  AND z.id = ABS(CHECKSUM(f.imitm, 88)) % 8
WHERE RTRIM(ISNULL(f.imdsc1,'')) <> '';
PRINT 'F4101 imdsc1: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- F4096 AAI descriptions (3 rows) ------------------------ */
UPDATE PRODDTA.F4096 SET fadl01 = 'Inventory AAI mapping'
WHERE RTRIM(ISNULL(fadl01,'')) <> '';
PRINT 'F4096 fadl01: ' + CAST(@@ROWCOUNT AS varchar(12));
