// Arquivo customStyles.js

import { StylesConfig } from 'react-select';

const customStyles: StylesConfig = {
  control: (provided) => ({
    ...provided,
    backgroundColor: '#363636',
    color: 'white',
    padding: '5px', // Adiciona padding ao controle
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: '#363636',
    color: 'white'
  }),
  option: (base, { isSelected, isFocused }) => ({
    ...base,
    padding: '10px', // Adiciona padding nas opções
    backgroundColor: isSelected ? '#4a4a4a' : 'transparent',
    color: 'white',
    '&:hover': {
      backgroundColor: isFocused ? 'yellow' : '#666666',
      color: 'black'
    }
  }),
  singleValue: (provided) => ({
    ...provided,
    color: 'lightgray',
    fontWeight: 'bold',
  }),
};

export default customStyles;
