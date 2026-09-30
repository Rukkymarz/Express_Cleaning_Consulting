<?php
namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function register(Request $request) {
        $v = $request->validate(['name'=>'required|string|max:150','email'=>'required|email:rfc|max:255|unique:users,email','password'=>'required|string|min:12|confirmed']);
        $user = User::create($v); $user->assignRole('customer'); Auth::login($user); $request->session()->regenerate();
        // Staff must link a prior guest request only after email ownership has been verified.
        return response()->json(['user' => $user->only('id','name','email')], 201);
    }
    public function login(Request $request) {
        $v=$request->validate(['email'=>'required|email','password'=>'required|string']);
        if (!Auth::attempt($v)) return response()->json(['error'=>['code'=>'invalid_credentials','message'=>'Email or password is incorrect.']], 422);
        $request->session()->regenerate();
        return response()->json(['user'=>$request->user()->only('id','name','email'), 'redirect_to'=>$request->user()->can('leads.view') ? '/admin' : '/account']);
    }
    public function logout(Request $request) { Auth::logout(); $request->session()->invalidate(); $request->session()->regenerateToken(); return response()->noContent(); }
}
