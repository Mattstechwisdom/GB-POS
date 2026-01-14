import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select: React.FC<SelectProps> = (props) => (
  <select
    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
    {...props}
  />
);

export default Select;
