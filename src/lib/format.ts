// Upper-cases only the first letter. CSS `text-transform: capitalize` would turn
// "quarta-feira, 4 de novembro" into "Quarta-Feira, 4 De Novembro".
export const capitalizeFirst = (text: string) =>
  text ? text[0]!.toLocaleUpperCase('pt-BR') + text.slice(1) : text
