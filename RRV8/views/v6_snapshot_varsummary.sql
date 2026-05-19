  
  
    Create View         [dbo].[v6_snapshot_varsummary]  
            -- with encryption  
            as  
            select      top 100 percent a.companynumber                                     as Company  
            ,   periodends               as PeriodEnds             
            --,           mcdl01                                                              as BusUnit  
   ,   curcode                as CurCode  
            ,           round(sum(unpostedbatchamount),0)                                   as [GL Batches]  
            ,           round(sum(endofday),0) * -1          as [End of Day]  
            ,           round(sum(transactionvariance),0) * -1                              as [Transactions]  
   ,           round(sum(journalentries),0)          as [Manual JEs]  
            from        raccountsummary a  
   join  rinvaccountlist b  
   on   a.shortaccount = b.shortaccount  
            join        f0006  
            on          a.businessunit = mcmcu  
   where  periodends between '2018-01-31' and '2018-04-30'  
   and   a.objectaccount not like '14140%'  
            group by    periodends  
            ,           a.companynumber  
            --,           mcdl01  
   ,   curcode  
            order by    a.companynumber  
            ,           periodends  
            --,           mcdl01  
     
  
  
  
