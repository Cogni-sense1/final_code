import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AudioLines, ArrowRight } from "lucide-react";
import { setUserName, hasCompletedOnboarding, getUserRole, hasSelectedRole } from "@/utils/userProfile";

const Welcome = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // Redirect if already onboarded
  useEffect(() => {
    if (!hasSelectedRole()) {
      navigate("/", { replace: true });
      return;
    }
    
    if (hasCompletedOnboarding()) {
      navigate("/home", { replace: true });
    }
  }, [navigate]);

  const handleContinue = () => {
    const trimmedName = name.trim();
    
    if (!trimmedName) {
      setError("Please enter your name");
      return;
    }
    
    if (trimmedName.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    
    // Save name to localStorage
    setUserName(trimmedName);
    
    // Always navigate to home
    navigate("/home");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleContinue();
    }
  };

  return (
    <div className="min-h-screen bg-[#EFEBE6] flex items-center justify-center px-5">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8 animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FF8C42] to-[#FF6B9D] flex items-center justify-center shadow-lg">
            <AudioLines className="text-white" size={24} />
          </div>
          <span className="text-3xl font-bold text-[#1A1A1A]">NeuroVoice</span>
        </div>

        {/* Welcome Card */}
        <div className="bg-white rounded-3xl p-8 shadow-lg mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <h1 className="text-2xl font-bold text-[#1A1A1A] text-center mb-2">
            Welcome to NeuroVoice
          </h1>
          <p className="text-[#6B6B6B] text-center text-sm mb-8">
            Early detection of neurological health through voice and facial analysis
          </p>

          {/* Name Input */}
          <div className="mb-6">
            <label htmlFor="name" className="block text-sm font-semibold text-[#1A1A1A] mb-2">
              What's your name?
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              onKeyPress={handleKeyPress}
              placeholder="Enter your full name"
              className="w-full px-4 py-3 rounded-2xl border-2 border-[#E0E0E0] focus:border-[#FF8C42] focus:outline-none text-[#1A1A1A] placeholder-[#B8B8B8] transition-colors"
              autoFocus
            />
            {error && (
              <p className="text-red-500 text-xs mt-2">{error}</p>
            )}
          </div>

          {/* Continue Button */}
          <button
            onClick={handleContinue}
            className="w-full bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
          >
            Continue
            <ArrowRight size={20} />
          </button>
        </div>

        {/* Info Card */}
        <div className="bg-white rounded-3xl p-5 shadow-sm animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-full bg-[#FFE8D6] flex items-center justify-center flex-shrink-0">
              <span className="text-lg">ℹ️</span>
            </div>
            <div>
              <p className="font-semibold text-[#1A1A1A] text-sm mb-1">Important Notice</p>
              <p className="text-[#6B6B6B] text-xs leading-relaxed">
                This is a screening tool, not a medical diagnosis. Always consult a healthcare professional for medical advice.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#999999] mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default Welcome;
