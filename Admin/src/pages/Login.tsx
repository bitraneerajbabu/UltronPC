import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Mail, AlertCircle } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setErrorMsg(error.message);
      }
    } catch (e: any) {
      setErrorMsg("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative select-none overflow-hidden">
      {/* Background ambient radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-65/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-[400px] bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-lg text-white mx-auto shadow-lg shadow-indigo-600/30">
            U
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white mt-4">
            UltrON Panel Login
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Sign in to access compliance telemetry
          </p>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start space-x-2 animate-shake">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Input Forms */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-slate-500" size={16} />
              <Input
                type="email"
                placeholder="admin@ultron.tech"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="pl-10 h-11 bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600 focus-visible:ring-1 focus-visible:ring-indigo-500 text-xs rounded-xl transition-all"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              Password
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 text-slate-500" size={16} />
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="pl-10 h-11 bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600 focus-visible:ring-1 focus-visible:ring-indigo-500 text-xs rounded-xl transition-all"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-55/90 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center mt-6"
          >
            {isLoading ? (
              <div className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-white animate-spin" />
            ) : (
              "Sign In to Platform"
            )}
          </Button>
        </form>
      </div>

      <div className="text-[10px] text-slate-500 mt-6 tracking-wide font-medium">
        Powered by Sunshine Technologies &copy; 2026
      </div>
    </div>
  );
}
