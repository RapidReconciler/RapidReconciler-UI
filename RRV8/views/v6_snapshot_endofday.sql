  
  
    CREATE View         [dbo].[v6_snapshot_endofday]  
            -- with encryption  
            as  
            select      top 100 percent companynumber                       as Company  
   ,   periodends                                          as Period  
            --,           branchplant                                       as Branch  
            ,   ordertype           as OT  
   ,   status            as Sts  
   ,   count(*)           as Records  
            ,           round(sum(amount),0)        as Variance  
            from        runpostedcardex  
   where  periodends <= '2016-05-31'  
            group by    periodends  
            ,           companynumber  
            --,           branchplant  
            ,           ordertype  
            --,           doctype  
   ,   status  
            order by    companynumber  
            ,           periodends  
            --,           branchplant  
  
