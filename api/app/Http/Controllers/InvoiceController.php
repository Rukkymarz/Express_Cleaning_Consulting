<?php
namespace App\Http\Controllers;

use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class InvoiceController extends Controller
{
    public function download(Request $request, string $bookingId)
    {
        $invoice = DB::table('invoices as i')
            ->join('bookings as b','b.id','=','i.booking_id')
            ->join('quotes as q','q.id','=','b.quote_id')
            ->join('service_requests as sr','sr.id','=','q.service_request_id')
            ->join('addresses as a','a.id','=','sr.address_id')
            ->where('b.public_id',$bookingId)->where('b.customer_id',$request->user()->id)
            ->first(['i.number','i.currency','i.subtotal_cents','i.tax_cents','i.total_cents','i.issued_at','i.due_at','b.id as booking_id','b.start_at','q.id as quote_id','a.street','a.city','a.region','a.postal_code']);
        abort_unless($invoice,404);
        $items=DB::table('quote_items')->where('quote_id',$invoice->quote_id)->get(['description','quantity','unit_cents','total_cents']);
        $paid=(int)DB::table('payments')->where('booking_id',$invoice->booking_id)
            ->whereIn('status',['succeeded','partially_refunded'])
            ->selectRaw('COALESCE(SUM(amount_cents - refunded_cents),0) as paid')->value('paid');
        $safe=fn ($s)=>htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
        $money=fn ($c)=>'$'.number_format($c/100,2);
        $rows='';
        foreach($items as $item) $rows.='<tr><td>'.$safe($item->description).'</td><td>'.$item->quantity.'</td><td>'.$money($item->unit_cents).'</td><td>'.$money($item->total_cents).'</td></tr>';
        $html='<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:DejaVu Sans,sans-serif;color:#1E293B;font-size:12px}h1{color:#0B8B77}table{border-collapse:collapse;width:100%;margin-top:25px}td,th{padding:10px;border-bottom:1px solid #D8DEE9;text-align:left}.totals{text-align:right;margin-top:24px;line-height:2}</style></head><body>'
            .'<h1>Express Cleaning Consult</h1><h2>Invoice '.$safe($invoice->number).'</h2>'
            .'<p>Issued: '.$safe($invoice->issued_at).' · Service: '.$safe($invoice->start_at).'</p>'
            .'<p>Bill to: '.$safe($request->user()->name).'<br>'.$safe($request->user()->email).'<br>'
            .$safe($invoice->street.', '.$invoice->city.', '.$invoice->region.' '.$invoice->postal_code).'</p>'
            .'<table><thead><tr><th>Service</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>'.$rows.'</tbody></table>'
            .'<div class="totals">Subtotal: '.$money($invoice->subtotal_cents).'<br>Tax: '.$money($invoice->tax_cents)
            .'<br><strong>Total: '.$money($invoice->total_cents).'</strong><br>Paid: '.$money($paid)
            .'<br><strong>Balance: '.$money(max(0,$invoice->total_cents-$paid)).'</strong></div></body></html>';
        $options=new Options(); $options->set('isRemoteEnabled',false);
        $pdf=new Dompdf($options); $pdf->loadHtml($html); $pdf->setPaper('letter'); $pdf->render();
        return response($pdf->output(),200,['Content-Type'=>'application/pdf','Content-Disposition'=>'attachment; filename="'.$invoice->number.'.pdf"','Cache-Control'=>'private, no-store']);
    }
}
