import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input: React.FC<InputProps> = (props) => (
  <input
    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
    {...props}
  />
);

export default Input;
