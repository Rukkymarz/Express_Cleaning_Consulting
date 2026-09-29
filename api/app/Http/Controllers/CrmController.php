<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class CrmController extends Controller
{
    public function accountBookings(Request $request) {
        return response()->json(DB::table('bookings as b')->join('quotes as q','q.id','=','b.quote_id')->where('b.customer_id',$request->user()->id)->orderByDesc('b.id')->cursorPaginate(20, ['b.id','b.public_id','b.status','b.start_at','b.end_at','b.time_zone',DB::raw("q.total_cents - COALESCE((SELECT SUM(p.amount_cents - p.refunded_cents) FROM payments p WHERE p.booking_id=b.id AND p.status IN ('succeeded','partially_refunded')),0) AS balance_due_cents")]));
    }
    public function accountBooking(Request $request, string $publicId) {
        $booking=DB::table('bookings as b')->join('quotes as q','q.id','=','b.quote_id')->where('b.public_id',$publicId)->where('b.customer_id',$request->user()->id)->first(['b.public_id','b.status','q.total_cents','q.deposit_cents',DB::raw("q.total_cents - COALESCE((SELECT SUM(p.amount_cents - p.refunded_cents) FROM payments p WHERE p.booking_id=b.id AND p.status IN ('succeeded','partially_refunded')),0) AS balance_due_cents")]);
        abort_unless($booking,404);return response()->json($booking);
    }
    public function invoices(Request $request, int $bookingId) {
        $booking=DB::table('bookings')->where('id',$bookingId)->where('customer_id',$request->user()->id)->first(); abort_unless($booking,404);
        return response()->json(DB::table('payments')->where('booking_id',$bookingId)->get(['kind','status','amount_cents','currency','created_at']));
    }
}
