  
    CREATE View         [dbo].[v6_snapshot_recsummary]  
            -- with encryption  
            as  
            select      top 100 percent periodends                                          as PeriodEnds  
            ,           a.companynumber                                                     as Company  
            ,           mcdl01                                                              as BusUnit  
   ,   curcode                as CurCode  
            ,           round(sum(endingglbalance),0)                                       as GL  
            ,           round(sum(amountonhand),0)                                          as Perpetual  
            ,           round(sum(outofbalance),0)                                          as OutofBalance  
            from        raccountsummary a  
   join  rinvaccountlist b  
   on   a.shortaccount = b.shortaccount  
            join        f0006  
            on          a.businessunit = mcmcu  
   where  periodends = '2016-05-31'  
   and   a.objectaccount not like '6%'  
            group by    periodends  
            ,           a.companynumber  
            ,           mcdl01  
   ,   curcode  
            order by    periodends  
            ,           a.companynumber  
            ,           mcdl01  
     
  
