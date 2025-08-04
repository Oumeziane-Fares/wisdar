// src/lib/greetings.ts

export const getGreeting = (name: string): string => {
  const hour = new Date().getHours();
  const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);

  if (hour >= 5 && hour < 12) {
    return `Good morning, ${capitalizedName}`;
  }
  if (hour >= 12 && hour < 18) {
    return `Good afternoon, ${capitalizedName}`;
  }
  // For evening and early morning hours
  return `Good evening, ${capitalizedName}`;
};