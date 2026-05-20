  
 CREATE View     [dbo].[v6ui_itemrollintegritydialog]                -- cast amount and quantity removed.   
            -- with encryption  
            as  
            select top 100 percent rtrim(reason)                as Reason  
            ,           b.reportcompany                   as CompanyNumber  
            ,           longaccount                    as LongAccount  
            ,           ltrim(b.branchplant)                 as Branch  
            ,           b.shortitem                    as ShortItem  
            ,           b.itemnumber                   as ItemNumber  
            ,           b.thirditem                    as ThirdItem  
            ,           location                    as Location  
            ,           lot                      as Lot  
            ,           costmethod                    as Method  
            ,           sum(round(baselinevar,2))                as AdjAmount  
            ,           sum(round(estunits,2))                 as AdjQty  
            ,           unitofmeasure                    as UOM  
   ,   b.glclass                    as GLClass  
   ,   case when d.branchplant is not null then ' Check Integrity 4' else '' end    as Comment  
            from        rperpetualinv a  
            join        ritems b  
            on          a.itemid = b.itemid  
            join        rinvaccountlist c  
            on          b.shortaccount = c.shortaccount  
   left join v_integrity4_uom_conv d  
   on   b.branchplant = d.branchplant  
   and   b.shortitem = d.shortitem  
            where       reason != ''  
   group by reason  
   ,   b.reportcompany  
   ,   longaccount  
   ,   b.branchplant  
   ,   b.shortitem  
   ,   b.itemnumber  
   ,   b.thirditem  
   ,   location  
   ,   lot  
   ,   costmethod  
   ,   unitofmeasure  
   ,   b.glclass  
   ,   d.branchplant  
   order by b.reportcompany  
   ,   longaccount  
   ,   reason  
   ,   b.branchplant  
   ,   b.shortitem  
   ,   b.itemnumber  
   ,   b.thirditem  
   ,   location  
   ,   lot  
