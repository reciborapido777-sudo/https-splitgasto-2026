const fs = require('fs');
const { globSync } = require('glob');
const cheerio = require('cheerio');

const files = globSync('./*.html', { ignore: ['node_modules/**', 'engine/**'] });
const results = [];
const spanishIndicators = /[áéíóúñÁÉÍÓÚÑ]|Cargando|Guardar|Cancelar|Aceptar|Error|Correcto|Bienvenido|Crear|Eliminar|Cerrar|Iniciar|Registr|Contraseña|Correo|Usuario|Nombre|Grupo|Gasto|Salir|Volver|Enviar|Buscar|Actualizar|Configuración|Notificación|Mensaje|Alerta|Advertencia|Éxito|Fall|Intenta|Debes|Selecciona|Introduce|Confirma|Sesión|soporte|moneda|idioma/;

files.forEach(file => {
  const html = fs.readFileSync(file, 'utf8');
  const $ = cheerio.load(html);
  $('script:not([src])').each((_, script) => {
    const code = $(script).html() || '';
    const lines = code.split('\n');
    lines.forEach((line, lineNum) => {
      const matches = line.match(/['"][^'"]{3,120}['"]/g);
      if (matches) {
        matches.forEach(str => {
          const clean = str.slice(1, -1);
          if (spanishIndicators.test(clean) && !clean.includes('http') && !clean.includes('.css') && !clean.includes('.js') && !clean.includes('<')) {
            results.push({ file, line: lineNum + 1, text: clean, context: line.trim().substring(0, 140) });
          }
        });
      }
    });
  });
});

fs.writeFileSync('hardcoded-i18n-report.json', JSON.stringify(results, null, 2));
console.log(`🔍 ${results.length} textos hardcodeados encontrados. Ver hardcoded-i18n-report.json`);
