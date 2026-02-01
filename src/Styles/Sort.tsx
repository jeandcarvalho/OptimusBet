import { StylesConfig } from 'react-select';
import { CSSObject } from '@emotion/react';

// Defina seus estilos personalizados
const customStylesSort: StylesConfig = {
  control: (provided) => ({
    ...provided,
    backgroundColor: '#363636',
    color: 'white'
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: '#363636',
    color: 'white'
  }),
  option: (base, { isSelected, isFocused }) => {
    const customOptionStylesSort: CSSObject = {
      ...base,
      backgroundColor: isSelected ? '#4a4a4a' : 'transparent', // Usando 'transparent' quando não selecionado
      color: 'white', // Cor do texto do item
      '&:hover': {
        backgroundColor: isFocused ? 'yellow' : '#666666', // Cor de fundo quando o mouse está sobre o item
        color: 'black' // Cor do texto do item quando o mouse está sobre ele
      }
    };
    return customOptionStylesSort;
  },
  // Adicione mais estilos conforme necessário
};

export default customStylesSort;
