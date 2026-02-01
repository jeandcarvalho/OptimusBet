// src/Utils/stringUtils.ts

export const formatString = (input: string | undefined): string => {
  if (!input) {  // Verifica se o input é undefined, null ou uma string vazia
    return '';  // Retorna uma string vazia ou um valor padrão desejado
  }
  return input.split(',').map(part => part.trim()).join(', ');
};
  
  export const filterCityString = (city: string): string => {
    const filtros = city.replace(/_/g, " ");
    const parts = filtros.split('!');
    const partss = parts.filter(part => part.trim() !== "");
    return partss.join(' - ');
  };
  