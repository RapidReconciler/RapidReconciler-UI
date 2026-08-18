/* ============================================================
   Demo3 (TR) sanitization — Stage 1: text scrub
   THEME: food & beverage ingredients  (disjoint from Demo1 mfg
   and Demo2 distribution — no shared pfx/noun, so no cross-demo
   name collision). Target: jdesource_tr  Schema: PRODDTA.
   Text/identity overwrites only; NO numeric re-encoding (TR is the
   real, correctly-encoded copy — leave the numbers alone). Company
   CODE remap to 30xxx happens in Stage 5, keyed on original ccco.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_tr;

/* ---- scratch schema + word lists (F&B, disjoint) ------------ */
IF SCHEMA_ID('scrub') IS NULL EXEC('CREATE SCHEMA scrub');
IF OBJECT_ID('scrub.w') IS NOT NULL DROP TABLE scrub.w;
CREATE TABLE scrub.w (kind varchar(12), id int, w nvarchar(40), PRIMARY KEY (kind,id));

/* agrarian / F&B brand prefixes — none appear in Demo1 or Demo2 */
INSERT scrub.w (kind,id,w) VALUES
 ('pfx',0,'Golden'),('pfx',1,'Harvest'),('pfx',2,'Orchard'),('pfx',3,'Prairie'),
 ('pfx',4,'Maplewood'),('pfx',5,'Cedarvale'),('pfx',6,'Willowdale'),('pfx',7,'Copperfield'),
 ('pfx',8,'Hearthstone'),('pfx',9,'Amberwood'),('pfx',10,'Clover'),('pfx',11,'Juniper'),
 ('pfx',12,'Rosewood'),('pfx',13,'Birchwood'),('pfx',14,'Springvale'),('pfx',15,'Brookfield'),
 ('pfx',16,'Fielding'),('pfx',17,'Homestead'),('pfx',18,'Farmstead'),('pfx',19,'Vineyard'),
 ('pfx',20,'Sunbelt'),('pfx',21,'Heritage'),('pfx',22,'Grovewood'),('pfx',23,'Sunrise');

/* F&B business nouns — disjoint from Demo1 mfg + Demo2 distribution */
INSERT scrub.w (kind,id,w) VALUES
 ('noun',0,'Foods'),('noun',1,'Ingredients'),('noun',2,'Beverages'),('noun',3,'Farms'),
 ('noun',4,'Bakery'),('noun',5,'Dairy'),('noun',6,'Mills'),('noun',7,'Kitchens'),
 ('noun',8,'Creamery'),('noun',9,'Cannery'),('noun',10,'Roasters'),('noun',11,'Nutrition'),
 ('noun',12,'Orchards'),('noun',13,'Growers'),('noun',14,'Gourmet'),('noun',15,'Naturals');

INSERT scrub.w (kind,id,w) VALUES
 ('sfx',0,'Inc.'),('sfx',1,'LLC'),('sfx',2,'Corp.'),('sfx',3,'Ltd.'),('sfx',4,'Co.'),('sfx',5,'Group');

/* F&B facility types (site + place stays <=30 for mcdl01) */
INSERT scrub.w (kind,id,w) VALUES
 ('site',0,'Processing Plant'),('site',1,'Bottling Line'),('site',2,'Cold Storage'),
 ('site',3,'Packing House'),('site',4,'Blending Ctr'),('site',5,'Grain Mill');

/* place names — fresh, disjoint from Demo1 + Demo2 places */
INSERT scrub.w (kind,id,w) VALUES
 ('place',0,'Greenvale'),('place',1,'Millbrook'),('place',2,'Cedar Falls'),('place',3,'Springdale'),
 ('place',4,'Fairhaven'),('place',5,'Elmwood'),('place',6,'Maple Grove'),('place',7,'Sunbury'),
 ('place',8,'Clearbrook'),('place',9,'Rosedale'),('place',10,'Brookhaven'),('place',11,'Westfarm');

/* product grade (was 'mat') */
INSERT scrub.w (kind,id,w) VALUES
 ('mat',0,'Organic'),('mat',1,'Select'),('mat',2,'Natural'),('mat',3,'Pure'),
 ('mat',4,'Gourmet'),('mat',5,'Artisan'),('mat',6,'Classic'),('mat',7,'Farmhouse');

/* distributed F&B product types (each <=12 so mat+ptype+size <=30) */
INSERT scrub.w (kind,id,w) VALUES
 ('ptype',0,'Cocoa Powder'),('ptype',1,'Fruit Puree'),('ptype',2,'Cane Sugar'),('ptype',3,'Sea Salt'),
 ('ptype',4,'Olive Oil'),('ptype',5,'Honey Syrup'),('ptype',6,'Tomato Paste'),('ptype',7,'Corn Starch'),
 ('ptype',8,'Spice Blend'),('ptype',9,'Fruit Juice'),('ptype',10,'Coffee Beans'),('ptype',11,'Whey Powder'),
 ('ptype',12,'Malt Syrup'),('ptype',13,'Fruit Jam'),('ptype',14,'Baking Soda');

/* pack sizes (was 'size') */
INSERT scrub.w (kind,id,w) VALUES
 ('size',0,'Drum'),('size',1,'Tote'),('size',2,'Sack'),('size',3,'Pail'),
 ('size',4,'Jar'),('size',5,'Bottle'),('size',6,'Bag'),('size',7,'Barrel');

/* ---- F0010 company names — CURATED (generator collides on the
   12 sequential company numbers). Keyed on ORIGINAL ccco; Stage 5
   remaps the code to 30xxx. Approved mapping 2026-07-11. ---------- */
UPDATE PRODDTA.F0010 SET ccname =
  CASE RTRIM(ccco)
    WHEN '00000' THEN 'Harvest Foods Group'
    WHEN '00001' THEN 'Golden Harvest Foods Ltd.'
    WHEN '00002' THEN 'Golden Harvest Foods USA Inc.'
    WHEN '00003' THEN 'Orchard Lane Ingredients Ltd.'
    WHEN '00004' THEN 'Maplewood Farms Ltd.'
    WHEN '00005' THEN 'Cedarvale Oils Co.'
    WHEN '00006' THEN 'Maplewood Farms (SA) Pty Ltd.'
    WHEN '00007' THEN 'Maplewood Farms India Pvt Ltd.'
    WHEN '00008' THEN 'Rosewood Naturals Ltd.'
    WHEN '00009' THEN 'Rosewood Naturals (EA) Ltd.'
    WHEN '00010' THEN 'Harvest Foods Development Co.'
    WHEN '00011' THEN 'Golden Harvest (Asia) Ltd.'
    WHEN '00998' THEN 'Security Cost Center Company'
    WHEN '00999' THEN 'Model Company'
    WHEN '99998' THEN 'Elimination Company 2100'
    WHEN '99999' THEN 'Chart of Accounts/Subledgers'
    ELSE 'Golden Harvest Foods'
  END
WHERE RTRIM(ISNULL(ccname,'')) <> '';
PRINT 'F0010 ccname: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- F0101 address-book names (themed; aban8 distributes well) - */
UPDATE f SET abalph = LEFT(p.w + N' ' + n.w + N' ' + s.w, 40)
FROM PRODDTA.F0101 f
JOIN scrub.w p ON p.kind='pfx'  AND p.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(CONVERT(varchar(30),f.aban8)),'|p')))) % 24
JOIN scrub.w n ON n.kind='noun' AND n.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(CONVERT(varchar(30),f.aban8)),'|n')))) % 16
JOIN scrub.w s ON s.kind='sfx'  AND s.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(CONVERT(varchar(30),f.aban8)),'|s')))) % 6
WHERE RTRIM(ISNULL(f.abalph,'')) <> '';
PRINT 'F0101 abalph: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- F0006 business-unit descriptions (location names) ------- */
UPDATE f SET mcdl01 = LEFT(st.w + N' ' + pl.w, 30)
FROM PRODDTA.F0006 f
JOIN scrub.w st ON st.kind='site'  AND st.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(CONVERT(varchar(30),f.mcmcu)),'|st')))) % 6
JOIN scrub.w pl ON pl.kind='place' AND pl.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(CONVERT(varchar(30),f.mcmcu)),'|pl')))) % 12
WHERE RTRIM(ISNULL(f.mcdl01,'')) <> '';
PRINT 'F0006 mcdl01: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- F4101 item descriptions (F&B goods) --------------------- */
UPDATE f SET imdsc1 = LEFT(m.w + N' ' + t.w + N' ' + z.w, 30)
FROM PRODDTA.F4101 f
JOIN scrub.w m ON m.kind='mat'   AND m.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(CONVERT(varchar(30),f.imitm)),'|m')))) % 8
JOIN scrub.w t ON t.kind='ptype' AND t.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(CONVERT(varchar(30),f.imitm)),'|t')))) % 15
JOIN scrub.w z ON z.kind='size'  AND z.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(CONVERT(varchar(30),f.imitm)),'|z')))) % 8
WHERE RTRIM(ISNULL(f.imdsc1,'')) <> '';
PRINT 'F4101 imdsc1: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- F4096 AAI descriptions --------------------------------- */
UPDATE PRODDTA.F4096 SET fadl01 = 'Inventory AAI mapping'
WHERE RTRIM(ISNULL(fadl01,'')) <> '';
PRINT 'F4096 fadl01: ' + CAST(@@ROWCOUNT AS varchar(12));
PRINT 'STAGE1_TEXT_COMPLETE';
