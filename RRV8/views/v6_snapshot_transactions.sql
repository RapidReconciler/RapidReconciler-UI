    CREATE View         [dbo].[v6_snapshot_transactions]  
            -- with encryption  
            as  
            select      top 100 percent a.companynumber                     as Company  
   ,   periodends                                          as PeriodEnds  
            --,           businessunit                                      as BusinessUnit  
            ,           type                                                as Module  
   ,   doctype            as DT  
            ,   ordertype           as OT  
            ,           round(sum(variance) ,0)                             as Variance  
            from        rcardexledgercompare2 a  
            join        rinvaccountlist b  
            on          a.shortaccount = b.shortaccount  
   where  recstatus < 2  
   and   periodends <= '2016-05-31'  
   and   objectaccount not like '6%'  
            group by    periodends  
            ,           a.companynumber  
            --,           businessunit  
            ,           type  
            ,           ordertype  
            ,           doctype  
            order by    a.companynumber  
   ,   periodends  
            --,           businessunit  
            ,           type  
  
  
