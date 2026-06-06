// User Profile Management with localStorage

const USER_NAME_KEY = 'neurovoice_user_name';
const USER_ROLE_KEY = 'neurovoice_user_role';

export type UserRole = 'user' | 'doctor' | 'caregiver';

// Get user name from localStorage
export const getUserName = (): string => {
  try {
    const name = localStorage.getItem(USER_NAME_KEY);
    return name || '';
  } catch (error) {
    console.error('Error reading user name:', error);
    return '';
  }
};

// Save user name to localStorage
export const setUserName = (name: string): void => {
  try {
    localStorage.setItem(USER_NAME_KEY, name.trim());
  } catch (error) {
    console.error('Error saving user name:', error);
  }
};

// Check if user has completed onboarding (has a name)
export const hasCompletedOnboarding = (): boolean => {
  const name = getUserName();
  return name.length > 0;
};

// Clear user name (for logout/reset)
export const clearUserName = (): void => {
  try {
    localStorage.removeItem(USER_NAME_KEY);
  } catch (error) {
    console.error('Error clearing user name:', error);
  }
};

// Get first name only
export const getFirstName = (): string => {
  const fullName = getUserName();
  if (!fullName) return '';
  return fullName.split(' ')[0];
};

// Get initials for avatar
export const getUserInitials = (): string => {
  const name = getUserName();
  if (!name) return 'U';
  
  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

// Get user role from localStorage
export const getUserRole = (): UserRole | null => {
  try {
    const role = localStorage.getItem(USER_ROLE_KEY);
    return role as UserRole | null;
  } catch (error) {
    console.error('Error reading user role:', error);
    return null;
  }
};

// Save user role to localStorage
export const setUserRole = (role: UserRole): void => {
  try {
    localStorage.setItem(USER_ROLE_KEY, role);
  } catch (error) {
    console.error('Error saving user role:', error);
  }
};

// Clear user role (for logout/reset)
export const clearUserRole = (): void => {
  try {
    localStorage.removeItem(USER_ROLE_KEY);
  } catch (error) {
    console.error('Error clearing user role:', error);
  }
};

// Check if user has selected a role
export const hasSelectedRole = (): boolean => {
  const role = getUserRole();
  return role !== null;
};
