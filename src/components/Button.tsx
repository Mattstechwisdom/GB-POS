import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  neon?: boolean;
}

const Button: React.FC<ButtonProps> = ({ neon, className = '', ...props }) => (
  <button
    className={`px-3 py-1 rounded text-xs font-bold focus:outline-none focus:ring-2 ${neon ? 'bg-[#39FF14] text-black focus:ring-[#39FF14]' : 'bg-zinc-700 text-white focus:ring-zinc-400'} ${className}`}
    {...props}
  />
);

export default Button;
