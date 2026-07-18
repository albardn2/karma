import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { KeyboardIcon, CreditCard, User, Lock } from 'lucide-react';

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, isLoading } = useAuth();
  const { toast } = useToast();
  
  // Default to RFID on desktop, username/password on mobile
  const [activeTab, setActiveTab] = useState<'rfid' | 'manual'>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > 768 ? 'rfid' : 'manual';
    }
    return 'manual';
  });
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rfidInput, setRfidInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  // RFID scanning logic for web desktop
  useEffect(() => {
    if (activeTab === 'rfid' && typeof window !== 'undefined' && window.innerWidth > 768) {
      let clearTimer: NodeJS.Timeout;

      const handleKeyPress = (event: KeyboardEvent) => {
        // Prevent default behavior for most keys during RFID scanning
        if (event.key === 'Enter' && rfidInput.length > 0) {
          event.preventDefault();
          handleRfidLogin(rfidInput);
          setRfidInput('');
          if (clearTimer) {
            clearTimeout(clearTimer);
          }
        } else if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
          event.preventDefault();
          setRfidInput(prev => prev + event.key);
          setIsScanning(true);
        }
      };

      document.addEventListener('keydown', handleKeyPress);
      
      return () => {
        document.removeEventListener('keydown', handleKeyPress);
        if (clearTimer) {
          clearTimeout(clearTimer);
        }
      };
    }
  }, [rfidInput, activeTab]);

  // Clear RFID input after inactivity
  useEffect(() => {
    if (activeTab === 'rfid' && rfidInput.length > 0) {
      const clearTimer = setTimeout(() => {
        setRfidInput('');
        setIsScanning(false);
      }, 2000);

      return () => {
        clearTimeout(clearTimer);
      };
    }
  }, [rfidInput, activeTab]);

  const handleRfidLogin = async (rfidCode: string) => {
    if (!rfidCode || rfidCode.length < 8) {
      toast({
        title: "Invalid RFID",
        description: "RFID code is too short",
        variant: "destructive",
      });
      return;
    }

    try {
      const success = await login(rfidCode);
      if (success) {
        setLocation('/');
      } else {
        toast({
          title: "Login Failed",
          description: "Invalid RFID code. Please try again or use manual login.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Network Error",
        description: "Unable to connect to the server. Please check your connection.",
        variant: "destructive",
      });
    }
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    try {
      const success = await login(username, password);
      if (success) {
        setLocation('/');
      } else {
        toast({
          title: "Login Failed",
          description: "Invalid username or password. Please check your credentials.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Network Error",
        description: "Unable to connect to the server. Please check your connection.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen brand-gradient flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/95 backdrop-blur-sm shadow-2xl">
        <CardContent className="p-8">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 brand-gradient rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-white">
                {activeTab === 'rfid' ? '🔐' : '👋'}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {activeTab === 'rfid' ? 'RFID Authentication' : 'Welcome Back'}
            </h1>
            <p className="text-gray-600">
              {activeTab === 'rfid' ? 'Tap your card to continue' : 'Sign in to continue to your account'}
            </p>
          </div>

          {/* Tab Navigation - Only show on desktop */}
          {typeof window !== 'undefined' && window.innerWidth > 768 && (
            <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
              <button
                type="button"
                onClick={() => setActiveTab('rfid')}
                disabled={isLoading}
                className={`flex-1 flex items-center justify-center py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'rfid'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <CreditCard className="w-4 h-4 me-2" />
                RFID Scan
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                disabled={isLoading}
                className={`flex-1 flex items-center justify-center py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'manual'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <KeyboardIcon className="w-4 h-4 me-2" />
                Username & Password
              </button>
            </div>
          )}

          {/* RFID Interface */}
          {activeTab === 'rfid' && typeof window !== 'undefined' && window.innerWidth > 768 ? (
            <div className="text-center py-8">
              <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-6 transition-all duration-300 ${
                isScanning ? 'brand-gradient scale-110' : 'bg-gray-100'
              }`}>
                <CreditCard className={`w-12 h-12 ${isScanning ? 'text-white' : 'text-gray-400'}`} />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium text-gray-900">
                  {isLoading ? 'Authenticating...' : isScanning ? 'Scanning...' : 'Ready to scan'}
                </p>
                {rfidInput.length > 0 && (
                  <p className="text-sm text-gray-600 font-mono">
                    {'*'.repeat(Math.min(rfidInput.length, 12))}
                  </p>
                )}
                <p className="text-sm text-gray-500">
                  Position your RFID card near the reader
                </p>
              </div>
            </div>
          ) : (
            /* Manual Login Form */
            <form onSubmit={handleManualLogin} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                    Username or Email
                  </label>
                  <div className="relative">
                    <User className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username or email"
                      className="ps-10"
                      disabled={isLoading}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="ps-10"
                      disabled={isLoading}
                      autoComplete="current-password"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full brand-gradient hover:opacity-90 text-white"
                disabled={isLoading || !username || !password}
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>
          )}

          {/* Switch to Manual Login for RFID Tab */}
          {activeTab === 'rfid' && typeof window !== 'undefined' && window.innerWidth > 768 && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className="text-sm text-gray-600 hover:text-gray-900 underline"
                disabled={isLoading}
              >
                Use username and password instead
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}