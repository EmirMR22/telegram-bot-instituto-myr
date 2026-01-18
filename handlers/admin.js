const fs = require('fs');
const { Parser } = require('json2csv');
const db = require('../db');
const { esAdmin } = require('../services/auth');
const { obtenerUsuario } = require('../services/auth');


const estadoPago = {};
const estadoMorosos = {};
const estadoAlumno = {};
const estadoMensaje = {};
const estadoEditarAlumno = {};
const estadoPagosHoy = {};
const estadoFichaAlumno = {};



function lunesSemana() {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.toISOString().slice(0, 10);
}

function diaHoyTexto() {
    const map = {
        sunday: 'domingo',
        monday: 'lunes',
        tuesday: 'martes',
        wednesday: 'miercoles',
        thursday: 'jueves',
        friday: 'viernes',
        saturday: 'sabado'
    };

    const hoy = new Date()
        .toLocaleDateString('en-US', { weekday: 'long' })
        .toLowerCase();

    return map[hoy];
}


async function getAdminDbId(telegramId) {
    const [[r]] = await db.query(
        'SELECT id FROM usuarios WHERE telegram_id=? AND rol IN ("ADMIN","SUPER_ADMIN")',
        [telegramId]
    );
    return r?.id;
}

  async function mostrarFichaAlumno(bot, chatId, tgId, alumnoId) {
            const admin = await obtenerUsuario(tgId);

            let sqlAlumno = `
        SELECT 
            u.nombre,
            u.telefono,
            u.correo,
            u.dia_pago,
            p.nombre plantel,
            c.nombre carrera,
            u.activo
        FROM usuarios u
        JOIN planteles p ON p.id=u.plantel_id
        JOIN carreras c ON c.id=u.carrera_id
        WHERE u.id=?
    `;
            const params = [alumnoId];

            if (admin.rol === 'ADMIN') {
                sqlAlumno += ' AND u.plantel_id=?';
                params.push(admin.plantel_id);
            }

            const [[alumno]] = await db.query(sqlAlumno, params);

            if (!alumno) {
                return bot.sendMessage(chatId, '❌ Alumno no encontrado');
            }

            const [pagos] = await db.query(`
        SELECT 
            fecha_semana,
            monto,
            asistio,
            created_at
        FROM pagos
        WHERE usuario_id=?
        ORDER BY fecha_semana DESC
        LIMIT 10
    `, [alumnoId]);

            let msg = `📂 *Ficha del Alumno*\n\n`;
            msg += `👤 *Nombre:* ${alumno.nombre}\n`;
            msg += `📱 *Tel:* ${alumno.telefono}\n`;
            msg += `📧 *Correo:* ${alumno.correo || '—'}\n`;
            msg += `🏫 *Plantel:* ${alumno.plantel}\n`;
            msg += `🎓 *Carrera:* ${alumno.carrera}\n`;
            msg += `📅 *Día pago:* ${alumno.dia_pago}\n`;
            msg += `📌 *Estado:* ${alumno.activo ? 'Activo' : 'Inactivo'}\n\n`;

            msg += `📊 *Últimos pagos*\n`;
            if (!pagos.length) {
                msg += '— Sin pagos registrados\n';
            } else {
                pagos.forEach(p => {
                    msg += `🗓 ${p.fecha_semana} | 💰 $${p.monto} | ${p.asistio ? '✅' : '❌'}\n`;
                });
            }

            return bot.sendMessage(chatId, msg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅️ Volver', callback_data: 'admin_menu' }]
                    ]
                }
            });
        }


async function showAdminMenu(bot, chatId, tgId) {
    if (!await esAdmin(tgId)) return bot.sendMessage(chatId, '❌ Acceso denegado');

    return bot.sendMessage(chatId, '👨‍💼 *Menú Administrador*', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '👤 Registrar alumno', callback_data: 'admin_registrar_alumno' }],
                [{ text: '✏️ Editar alumno', callback_data: 'admin_editar_alumno' }],
                [{ text: '🗑️ Desactivar alumno', callback_data: 'admin_desactivar_alumno' }],
                [{ text: '📂 Ficha del alumno', callback_data: 'admin_ficha_alumno' }],
                [{ text: '📸 Registrar pago', callback_data: 'admin_pago' }],
                [{ text: '🚨 Alumnos morosos', callback_data: 'admin_morosos' }],
                [{ text: '📝 Editar/Eliminar pago', callback_data: 'admin_editar_pago' }],
                [{ text: '📊 Reporte por plantel', callback_data: 'admin_reporte' }],
                [{ text: '📊 Reporte por carrera', callback_data: 'admin_reporte_carrera' }],
                [{ text: '💰 Ingresos diarios', callback_data: 'admin_ingresos_dia' }],
                [{ text: '📅 ¿Quienes pagan hoy?', callback_data: 'admin_pagos_hoy' }],
                [{ text: '📣 Enviar mensaje', callback_data: 'admin_enviar_mensaje' }]
            ]
        }
    });
}

async function volverMenuAdmin(bot, chatId, tgId) {
    await showAdminMenu(bot, chatId, tgId);
}

module.exports = (bot) => {
    if (!bot) return { showAdminMenu };

    bot.on('callback_query', async (q) => {
        const chatId = q.message.chat.id;
        const tgId = q.from.id;
        await bot.answerCallbackQuery(q.id);

        try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: q.message.message_id });
        } catch (e) { }

        if (q.data === 'admin_menu') return showAdminMenu(bot, chatId, tgId);
        if (!await esAdmin(tgId)) return;

        // =======================
        // 📂 FICHA DEL ALUMNO
        // =======================

        if (q.data === 'admin_ficha_alumno') {
            return bot.sendMessage(chatId, '🔎 Buscar alumno por:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🏫 Por plantel', callback_data: 'ficha_buscar_plantel' }],
                        [{ text: '📱 Por teléfono', callback_data: 'ficha_buscar_telefono' }],
                        [{ text: '🆔 Por ID', callback_data: 'ficha_buscar_id' }],
                        [{ text: '⬅️ Volver', callback_data: 'admin_menu' }]
                    ]
                }
            });
        }

        //BUSCAR ALUMNO POR PLANTEL


        if (q.data === 'ficha_buscar_plantel') {
            const admin = await obtenerUsuario(tgId);

            let sql = 'SELECT id,nombre FROM planteles WHERE activo=1';
            const params = [];

            if (admin.rol === 'ADMIN') {
                sql += ' AND id=?';
                params.push(admin.plantel_id);
            }

            const [planteles] = await db.query(sql, params);

            return bot.sendMessage(chatId, '🏫 Selecciona plantel:', {
                reply_markup: {
                    inline_keyboard: planteles.map(p => [
                        { text: p.nombre, callback_data: `ficha_plantel_${p.id}` }
                    ])
                }
            });
        }

        //LISTAR ALUMNO POR PLANTEL

        if (q.data.startsWith('ficha_plantel_')) {
            const plantelId = q.data.split('_')[2];
            const admin = await obtenerUsuario(tgId);

            if (admin.rol === 'ADMIN' && admin.plantel_id != plantelId) {
                await bot.sendMessage(chatId, '❌ No tienes acceso a este plantel');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            const [alumnos] = await db.query(`
        SELECT id, nombre
        FROM usuarios
        WHERE rol='ALUMNO'
          AND activo=1
          AND plantel_id=?
    `, [plantelId]);

            if (!alumnos.length) {
                await bot.sendMessage(chatId, 'ℹ️ No hay alumnos');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            return bot.sendMessage(chatId, '👤 Selecciona alumno:', {
                reply_markup: {
                    inline_keyboard: alumnos.map(a => [
                        { text: a.nombre, callback_data: `ficha_alumno_${a.id}` }
                    ])
                }
            });
        }


        //MOSTRAR FICHA COMPLETA

        if (q.data.startsWith('ficha_alumno_')) {
            const alumnoId = q.data.split('_')[2];
            const admin = await obtenerUsuario(tgId);

            let sqlAlumno = `
        SELECT 
            u.nombre,
            u.telefono,
            u.correo,
            u.dia_pago,
            p.nombre plantel,
            c.nombre carrera,
            u.activo
        FROM usuarios u
        JOIN planteles p ON p.id=u.plantel_id
        JOIN carreras c ON c.id=u.carrera_id
        WHERE u.id=?
    `;
            const params = [alumnoId];

            if (admin.rol === 'ADMIN') {
                sqlAlumno += ' AND u.plantel_id=?';
                params.push(admin.plantel_id);
            }

            const [[alumno]] = await db.query(sqlAlumno, params);

            if (!alumno) {
                await bot.sendMessage(chatId, '❌ Alumno no encontrado');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            const [pagos] = await db.query(`
        SELECT 
            fecha_semana,
            monto,
            asistio,
            created_at
        FROM pagos
        WHERE usuario_id=?
        ORDER BY fecha_semana DESC
        LIMIT 10
    `, [alumnoId]);

            let msg = `📂 *Ficha del Alumno*\n\n`;
            msg += `👤 *Nombre:* ${alumno.nombre}\n`;
            msg += `📱 *Tel:* ${alumno.telefono}\n`;
            msg += `📧 *Correo:* ${alumno.correo || '—'}\n`;
            msg += `🏫 *Plantel:* ${alumno.plantel}\n`;
            msg += `🎓 *Carrera:* ${alumno.carrera}\n`;
            msg += `📅 *Día pago:* ${alumno.dia_pago}\n`;
            msg += `📌 *Estado:* ${alumno.activo ? 'Activo' : 'Inactivo'}\n\n`;

            msg += `📊 *Últimos pagos*\n`;
            if (!pagos.length) {
                msg += '— Sin pagos registrados\n';
            } else {
                pagos.forEach(p => {
                    msg += `🗓 ${p.fecha_semana} | 💰 $${p.monto} | ${p.asistio ? '✅' : '❌'}\n`;
                });
            }

            return bot.sendMessage(chatId, msg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅️ Volver', callback_data: 'admin_menu' }]
                    ]
                }
            });
        }

        if (q.data === 'ficha_buscar_telefono') {
            estadoFichaAlumno[tgId] = { paso: 'telefono' };

            return bot.sendMessage(
                chatId,
                '📱 Ingresa el *teléfono* del alumno:',
                { parse_mode: 'Markdown' }
            );
        }



        //ALUMNOS MOROSOS

        if (q.data === 'admin_morosos') {
            return bot.sendMessage(chatId, '🚨 Ver alumnos morosos por:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🏫 Plantel', callback_data: 'morosos_plantel' }],
                        [{ text: '🎓 Carrera', callback_data: 'morosos_carrera' }],
                        [{ text: '❌ Cancelar', callback_data: 'admin_menu' }]
                    ]
                }
            });
        }

        if (q.data === 'morosos_plantel') {
            const [planteles] = await db.query(
                'SELECT id, nombre FROM planteles WHERE activo=1'
            );

            return bot.sendMessage(chatId, '🏫 Selecciona plantel:', {
                reply_markup: {
                    inline_keyboard: planteles.map(p => [
                        { text: p.nombre, callback_data: `morosos_plantel_${p.id}` }
                    ])
                }
            });
        }

        // MOROSOS POR PLANTEL
        if (q.data.startsWith('morosos_plantel_')) {
            const plantelId = q.data.split('_')[2];

            const admin = await obtenerUsuario(tgId);

            let sql = `
        SELECT 
            u.id,
            u.nombre,
            u.dia_pago,
            c.nombre AS carrera
        FROM usuarios u
        JOIN carreras c ON c.id = u.carrera_id
        WHERE u.activo = 1
          AND FIND_IN_SET(LOWER(DAYNAME(CURDATE())), u.dia_pago)
          AND NOT EXISTS (
              SELECT 1 FROM pagos p
              WHERE p.usuario_id = u.id
                AND p.fecha_semana = ?
          )
    `;

            const params = [lunesSemana()];

            // 🔐 Admin normal: SOLO su plantel
            if (admin.rol === 'ADMIN') {
                sql += ' AND u.plantel_id = ?';
                params.push(admin.plantel_id);
            } else {
                // 🔓 Super admin: usa el plantel seleccionado
                sql += ' AND u.plantel_id = ?';
                params.push(plantelId);
            }

            const [rows] = await db.query(sql, params);

            if (rows.length === 0) {
                await bot.sendMessage(chatId, '✅ No hay alumnos morosos hoy');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            estadoMorosos[tgId] = rows.map(r => r.id);

            let msg = '🚨 *Alumnos morosos hoy*\n\n';

            rows.forEach(r => {
                msg += `👤 ${r.nombre}\n🎓 ${r.carrera}\n📅 ${r.dia_pago}\n\n`;
            });

            return bot.sendMessage(chatId, msg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📩 Enviar recordatorio', callback_data: 'morosos_enviar' }],
                        [{ text: '⬅️ Volver', callback_data: 'admin_menu' }]
                    ]
                }
            });
        }


        //MOROSOS POR CARRERA
        if (q.data.startsWith('morosos_carrera_')) {
            const carreraId = q.data.split('_')[2];

            const admin = await obtenerUsuario(tgId);

            let sql = `
        SELECT 
            u.nombre,
            u.dia_pago,
            p.nombre AS plantel
        FROM usuarios u
        JOIN planteles p ON p.id = u.plantel_id
        WHERE u.carrera_id = ?
          AND u.activo = 1
          AND FIND_IN_SET(LOWER(DAYNAME(CURDATE())), u.dia_pago)
          AND NOT EXISTS (
              SELECT 1 FROM pagos pa
              WHERE pa.usuario_id = u.id
                AND pa.fecha_semana = ?
          )
    `;

            const params = [carreraId, lunesSemana()];

            // 🔐 Admin normal: solo su plantel
            if (admin.rol === 'ADMIN') {
                sql += ' AND u.plantel_id = ?';
                params.push(admin.plantel_id);
            }

            const [rows] = await db.query(sql, params);

            if (rows.length === 0) {
                await bot.sendMessage(chatId, '✅ No hay alumnos morosos hoy');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            let msg = '🚨 *Alumnos morosos hoy*\n\n';

            rows.forEach(r => {
                msg += `👤 ${r.nombre}\n🏫 ${r.plantel}\n📅 ${r.dia_pago}\n\n`;
            });

            return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        }


        // NOTIFICACION MOROSOS
        if (q.data === 'morosos_enviar') {
            const alumnos = estadoMorosos[tgId];

            if (!alumnos || alumnos.length === 0) {
                return bot.sendMessage(chatId, '❌ No hay alumnos para notificar');
            }

            const admin = await obtenerUsuario(tgId);

            for (const alumnoId of alumnos) {
                let sql = `
            SELECT telegram_id, nombre
            FROM usuarios
            WHERE id=? AND activo=1
        `;
                const params = [alumnoId];

                // 🔐 Admin normal → solo su plantel
                if (admin.rol === 'ADMIN') {
                    sql += ' AND plantel_id=?';
                    params.push(admin.plantel_id);
                }

                const [[u]] = await db.query(sql, params);

                if (!u || !u.telegram_id) continue;

                try {
                    await bot.sendMessage(
                        u.telegram_id,
                        '📢 *Recordatorio de pago*\n\n' +
                        'Hola 👋\n' +
                        'Te recordamos que hoy es tu día de pago.\n' +
                        'Por favor realiza tu pago a la brevedad.\n\n' +
                        'Gracias 🙏',
                        { parse_mode: 'Markdown' }
                    );
                } catch (e) { }
            }

            delete estadoMorosos[tgId];

            await bot.sendMessage(chatId, '✅ Recordatorios enviados correctamente');
            return volverMenuAdmin(bot, chatId, tgId);
        }


        //¿QUIENES PAGAN HOY?

        if (q.data === 'admin_pagos_hoy') {
            estadoPagosHoy[tgId] = {};
            return bot.sendMessage(chatId, '📅 Ver alumnos que deben pagar HOY por:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📢 Todos', callback_data: 'pagos_hoy_todos' }],
                        [{ text: '🏫 Por plantel', callback_data: 'pagos_hoy_plantel' }],
                        [{ text: '🎓 Por carrera', callback_data: 'pagos_hoy_carrera' }],
                        [{ text: '❌ Cancelar', callback_data: 'admin_menu' }]
                    ]
                }
            });
        }

        if (q.data === 'pagos_hoy_todos') {
            const hoy = diaHoyTexto();
            const admin = await obtenerUsuario(tgId);

            let sql = `
        SELECT u.nombre, p.nombre plantel, c.nombre carrera
        FROM usuarios u
        JOIN planteles p ON p.id = u.plantel_id
        JOIN carreras c ON c.id = u.carrera_id
        WHERE u.activo = 1
          AND FIND_IN_SET(?, u.dia_pago)
    `;
            const params = [hoy];

            if (admin.rol === 'ADMIN') {
                sql += ' AND u.plantel_id=?';
                params.push(admin.plantel_id);
            }

            const [rows] = await db.query(sql, params);

            if (!rows.length) {
                await bot.sendMessage(chatId, '✅ No hay alumnos con pago hoy');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            let txt = `📅 *Pagos de hoy (${hoy})*\n\n`;
            rows.forEach(r => {
                txt += `👤 ${r.nombre}\n🏫 ${r.plantel}\n🎓 ${r.carrera}\n\n`;
            });

            await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
            return volverMenuAdmin(bot, chatId, tgId);
        }


        if (q.data === 'pagos_hoy_plantel') {
            const [planteles] = await db.query('SELECT id,nombre FROM planteles WHERE activo=1');
            return bot.sendMessage(chatId, '🏫 Selecciona plantel:', {
                reply_markup: {
                    inline_keyboard: planteles.map(p => [
                        { text: p.nombre, callback_data: `pagos_hoy_plantel_${p.id}` }
                    ])
                }
            });
        }

        if (q.data.startsWith('pagos_hoy_plantel_')) {
            const plantelId = q.data.split('_')[3];
            const hoy = diaHoyTexto();
            const admin = await obtenerUsuario(tgId);

            let sql = `
        SELECT u.nombre, c.nombre carrera
        FROM usuarios u
        JOIN carreras c ON c.id=u.carrera_id
        WHERE u.activo=1
          AND FIND_IN_SET(?, u.dia_pago)
    `;
            const params = [hoy];

            if (admin.rol === 'ADMIN') {
                sql += ' AND u.plantel_id=?';
                params.push(admin.plantel_id);
            } else {
                sql += ' AND u.plantel_id=?';
                params.push(plantelId);
            }

            const [rows] = await db.query(sql, params);

            if (!rows.length) {
                await bot.sendMessage(chatId, '✅ No hay pagos hoy para este plantel');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            let txt = `📅 *Pagos hoy (${hoy})*\n\n`;
            rows.forEach(r => {
                txt += `👤 ${r.nombre}\n🎓 ${r.carrera}\n\n`;
            });

            await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
            return volverMenuAdmin(bot, chatId, tgId);
        }



        if (q.data === 'pagos_hoy_carrera') {
            const [carreras] = await db.query('SELECT id,nombre FROM carreras WHERE activo=1');
            return bot.sendMessage(chatId, '🎓 Selecciona carrera:', {
                reply_markup: {
                    inline_keyboard: carreras.map(c => [
                        { text: c.nombre, callback_data: `pagos_hoy_carrera_${c.id}` }
                    ])
                }
            });
        }

        if (q.data.startsWith('pagos_hoy_carrera_')) {
            const carreraId = q.data.split('_')[3];
            const hoy = diaHoyTexto();
            const admin = await obtenerUsuario(tgId);

            let sql = `
        SELECT u.nombre, p.nombre plantel
        FROM usuarios u
        JOIN planteles p ON p.id=u.plantel_id
        WHERE u.activo=1
          AND u.carrera_id=?
          AND FIND_IN_SET(?, u.dia_pago)
    `;
            const params = [carreraId, hoy];

            if (admin.rol === 'ADMIN') {
                sql += ' AND u.plantel_id=?';
                params.push(admin.plantel_id);
            }

            const [rows] = await db.query(sql, params);

            if (!rows.length) {
                await bot.sendMessage(chatId, '✅ No hay pagos hoy para esta carrera');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            let txt = `📅 *Pagos hoy (${hoy})*\n\n`;
            rows.forEach(r => {
                txt += `👤 ${r.nombre}\n🏫 ${r.plantel}\n\n`;
            });

            await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
            return volverMenuAdmin(bot, chatId, tgId);
        }





        // REGISTRAR ALUMNO
        if (q.data === 'admin_registrar_alumno') {
            estadoAlumno[tgId] = { paso: 'nombre' };
            return bot.sendMessage(chatId, '✍️ Escribe el NOMBRE del alumno:');
        }

        if (q.data.startsWith('alu_plantel_')) {
            estadoAlumno[tgId].plantel_id = q.data.split('_')[2];
            estadoAlumno[tgId].paso = 'carrera';
            const [carreras] = await db.query('SELECT id, nombre FROM carreras WHERE activo=1');
            return bot.sendMessage(chatId, '🎓 Selecciona carrera:', {
                reply_markup: { inline_keyboard: carreras.map(c => [{ text: c.nombre, callback_data: `alu_carrera_${c.id}` }]) }
            });
        }

        if (q.data.startsWith('alu_carrera_')) {
            estadoAlumno[tgId].carrera_id = q.data.split('_')[2];
            estadoAlumno[tgId].paso = 'dias_pago';
            return bot.sendMessage(chatId, '📅 Ingresa los DÍAS DE PAGO (ej: lunes,miercoles,viernes):');
        }

        // EDITAR ALUMNO
        if (q.data === 'admin_editar_alumno') {
            const admin = await obtenerUsuario(tgId);

            let sql = `
        SELECT id, nombre
        FROM usuarios
        WHERE rol='ALUMNO'
          AND activo=1
    `;
            const params = [];

            if (admin.rol === 'ADMIN') {
                sql += ' AND plantel_id=?';
                params.push(admin.plantel_id);
            }

            const [alumnos] = await db.query(sql, params);

            if (!alumnos.length) {
                return bot.sendMessage(chatId, 'ℹ️ No hay alumnos disponibles');
            }

            return bot.sendMessage(chatId, '✏️ Selecciona alumno a editar:', {
                reply_markup: {
                    inline_keyboard: alumnos.map(a => [
                        { text: a.nombre, callback_data: `editar_alumno_${a.id}` }
                    ])
                }
            });
        }


        if (q.data.startsWith('editar_alumno_')) {
            const id = q.data.split('_')[2];
            const admin = await obtenerUsuario(tgId);

            let sql = `
        SELECT *
        FROM usuarios
        WHERE id=? AND rol='ALUMNO' AND activo=1
    `;
            const params = [id];

            if (admin.rol === 'ADMIN') {
                sql += ' AND plantel_id=?';
                params.push(admin.plantel_id);
            }

            const [[alumno]] = await db.query(sql, params);

            if (!alumno) {
                await bot.sendMessage(chatId, '❌ No tienes permiso para editar este alumno');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            estadoEditarAlumno[tgId] = {
                id: alumno.id,
                data: alumno,
                paso: 'preguntar_nombre'
            };

            return bot.sendMessage(
                chatId,
                `¿Editar *NOMBRE*?\nActual: ${alumno.nombre}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Sí', callback_data: 'edit_nombre_si' }],
                            [{ text: '❌ No', callback_data: 'edit_nombre_no' }]
                        ]
                    }
                }
            );
        }



        // DESACTIVAR ALUMNO
        if (q.data === 'admin_desactivar_alumno') {
            const admin = await obtenerUsuario(tgId);

            let sql = `
        SELECT id, nombre
        FROM usuarios
        WHERE rol='ALUMNO'
          AND activo=1
    `;
            const params = [];

            if (admin.rol === 'ADMIN') {
                sql += ' AND plantel_id=?';
                params.push(admin.plantel_id);
            }

            const [alumnos] = await db.query(sql, params);

            if (!alumnos.length) {
                return bot.sendMessage(chatId, 'ℹ️ No hay alumnos para desactivar');
            }

            return bot.sendMessage(chatId, '🗑️ Selecciona alumno a desactivar:', {
                reply_markup: {
                    inline_keyboard: alumnos.map(a => [
                        { text: a.nombre, callback_data: `desactivar_alumno_${a.id}` }
                    ])
                }
            });
        }


        if (q.data.startsWith('desactivar_alumno_')) {
            const id = q.data.split('_')[2];
            const admin = await obtenerUsuario(tgId);

            let sql = `
        UPDATE usuarios
        SET activo=0
        WHERE id=? AND rol='ALUMNO'
    `;
            const params = [id];

            if (admin.rol === 'ADMIN') {
                sql += ' AND plantel_id=?';
                params.push(admin.plantel_id);
            }

            const [result] = await db.query(sql, params);

            if (result.affectedRows === 0) {
                await bot.sendMessage(chatId, '❌ No tienes permiso para desactivar este alumno');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            await bot.sendMessage(chatId, '✅ Alumno desactivado correctamente');
            return volverMenuAdmin(bot, chatId, tgId);
        }


        // =======================
        // 💰 REGISTRAR PAGO
        // =======================

        if (q.data === 'admin_pago') {
            const admin = await obtenerUsuario(tgId);
            estadoPago[tgId] = {};

            let sql = 'SELECT id, nombre FROM planteles WHERE activo=1';
            const params = [];

            if (admin.rol === 'ADMIN') {
                sql += ' AND id=?';
                params.push(admin.plantel_id);
            }

            const [planteles] = await db.query(sql, params);

            if (!planteles.length) {
                await bot.sendMessage(chatId, '❌ No tienes planteles asignados');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            return bot.sendMessage(chatId, '🏫 Selecciona plantel:', {
                reply_markup: {
                    inline_keyboard: planteles.map(p => [
                        { text: p.nombre, callback_data: `pago_plantel_${p.id}` }
                    ])
                }
            });
        }

        // =======================
        // 👤 SELECCIONAR ALUMNO
        // =======================

        if (q.data.startsWith('pago_plantel_')) {
            const admin = await obtenerUsuario(tgId);
            const plantelId = q.data.split('_')[2];

            if (admin.rol === 'ADMIN' && admin.plantel_id != plantelId) {
                await bot.sendMessage(chatId, '❌ No tienes acceso a este plantel');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            estadoPago[tgId].plantel_id = plantelId;

            const [alumnos] = await db.query(`
        SELECT id, nombre
        FROM usuarios
        WHERE rol='ALUMNO'
          AND activo=1
          AND plantel_id=?
    `, [plantelId]);

            if (!alumnos.length) {
                await bot.sendMessage(chatId, 'ℹ️ No hay alumnos en este plantel');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            return bot.sendMessage(chatId, '👤 Selecciona alumno:', {
                reply_markup: {
                    inline_keyboard: alumnos.map(a => [
                        { text: a.nombre, callback_data: `pago_alumno_${a.id}` }
                    ])
                }
            });
        }

        // =======================
        // 📋 ASISTENCIA
        // =======================

        if (q.data.startsWith('pago_alumno_')) {
            const admin = await obtenerUsuario(tgId);
            const alumnoId = q.data.split('_')[2];

            let sql = `
        SELECT id
        FROM usuarios
        WHERE id=?
          AND rol='ALUMNO'
          AND activo=1
    `;
            const params = [alumnoId];

            if (admin.rol === 'ADMIN') {
                sql += ' AND plantel_id=?';
                params.push(admin.plantel_id);
            }

            const [[alumno]] = await db.query(sql, params);

            if (!alumno) {
                await bot.sendMessage(chatId, '❌ No tienes permiso para este alumno');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            estadoPago[tgId].usuario_id = alumnoId;

            return bot.sendMessage(chatId, '📋 ¿Asistió a clases?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Sí', callback_data: 'pago_asistio_1' }],
                        [{ text: '❌ No', callback_data: 'pago_asistio_0' }]
                    ]
                }
            });
        }

        // =======================
        // 💰 MONTO
        // =======================

        if (q.data.startsWith('pago_asistio_')) {
            estadoPago[tgId].asistio = q.data.split('_')[2];
            estadoPago[tgId].paso = 'monto';
            return bot.sendMessage(chatId, '💰 Ingresa el MONTO del pago:');
        }

        // =======================
        // ✅ CONFIRMAR PAGO
        // =======================

        if (q.data === 'confirmar_pago') {
            const admin = await obtenerUsuario(tgId);
            const adminId = await getAdminDbId(tgId);
            const p = estadoPago[tgId];

            let sql = `
        SELECT id
        FROM usuarios
        WHERE id=?
          AND rol='ALUMNO'
          AND activo=1
    `;
            const params = [p.usuario_id];

            if (admin.rol === 'ADMIN') {
                sql += ' AND plantel_id=?';
                params.push(admin.plantel_id);
            }

            const [[ok]] = await db.query(sql, params);

            if (!ok) {
                await bot.sendMessage(chatId, '❌ No tienes permiso para registrar este pago');
                delete estadoPago[tgId];
                return volverMenuAdmin(bot, chatId, tgId);
            }

            await db.query(`
        INSERT INTO pagos
        (usuario_id, fecha_semana, monto, pagado, asistio, comprobante_file_id, registrado_por)
        VALUES (?, ?, ?, 1, ?, ?, ?)
    `, [
                p.usuario_id,
                lunesSemana(),
                p.monto,
                p.asistio,
                p.file_id,
                adminId
            ]);

            delete estadoPago[tgId];

            await bot.sendMessage(chatId, '✅ Pago registrado correctamente');
            return volverMenuAdmin(bot, chatId, tgId);
        }

        // =======================
        // ❌ CANCELAR
        // =======================

        if (q.data === 'cancelar_pago') {
            delete estadoPago[tgId];
            await bot.sendMessage(chatId, '❌ Registro de pago cancelado');
            return volverMenuAdmin(bot, chatId, tgId);
        }

        // =======================
        // 📊 REPORTES
        // =======================

        if (q.data === 'admin_reporte') {
            const admin = await obtenerUsuario(tgId);

            let sql = 'SELECT id, nombre FROM planteles WHERE activo=1';
            const params = [];

            if (admin.rol === 'ADMIN') {
                sql += ' AND id=?';
                params.push(admin.plantel_id);
            }

            const [planteles] = await db.query(sql, params);

            if (!planteles.length) {
                await bot.sendMessage(chatId, '❌ No tienes planteles asignados');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            return bot.sendMessage(chatId, '📊 Reportes por:', {
                reply_markup: {
                    inline_keyboard: [
                        ...planteles.map(p => [
                            { text: `🏫 ${p.nombre}`, callback_data: `rep_plantel_${p.id}` }
                        ]),
                        [{ text: '🎓 Por carrera', callback_data: 'admin_reporte_carrera' }],
                        [{ text: '💰 Ingresos del día', callback_data: 'admin_ingresos_dia' }],
                        [{ text: '⬅️ Volver', callback_data: 'admin_menu' }]
                    ]
                }
            });
        }

        // =======================
        // 🏫 REPORTE POR PLANTEL
        // =======================

        if (q.data.startsWith('rep_plantel_')) {
            const admin = await obtenerUsuario(tgId);
            const plantelId = q.data.split('_')[2];

            if (admin.rol === 'ADMIN' && admin.plantel_id != plantelId) {
                await bot.sendMessage(chatId, '❌ No tienes acceso a este plantel');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            const [rows] = await db.query(`
        SELECT 
            u.nombre AS alumno,
            c.nombre AS carrera,
            pa.fecha_semana,
            pa.monto
        FROM usuarios u
        JOIN carreras c ON c.id = u.carrera_id
        LEFT JOIN pagos pa ON pa.usuario_id = u.id
        WHERE u.activo = 1
          AND u.plantel_id = ?
    `, [plantelId]);

            if (!rows.length) {
                await bot.sendMessage(chatId, 'ℹ️ No hay registros para este plantel');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            const parser = new Parser({
                fields: ['alumno', 'carrera', 'fecha_semana', 'monto']
            });

            const csv = parser.parse(rows);
            fs.writeFileSync('reporte_plantel.csv', csv);
            await bot.sendDocument(chatId, 'reporte_plantel.csv');
            fs.unlinkSync('reporte_plantel.csv');

            return volverMenuAdmin(bot, chatId, tgId);
        }

        // =======================
        // 🎓 REPORTE POR CARRERA
        // =======================

        if (q.data === 'admin_reporte_carrera') {
            const [carreras] = await db.query(
                'SELECT id, nombre FROM carreras WHERE activo=1'
            );

            return bot.sendMessage(chatId, '🎓 Selecciona carrera:', {
                reply_markup: {
                    inline_keyboard: carreras.map(c => [
                        { text: c.nombre, callback_data: `rep_carrera_${c.id}` }
                    ])
                }
            });
        }

        if (q.data.startsWith('rep_carrera_')) {
            const admin = await obtenerUsuario(tgId);
            const carreraId = q.data.split('_')[2];

            let sql = `
        SELECT 
            u.nombre AS alumno,
            p.nombre AS plantel,
            pa.fecha_semana,
            pa.monto
        FROM usuarios u
        JOIN planteles p ON p.id = u.plantel_id
        LEFT JOIN pagos pa ON pa.usuario_id = u.id
        WHERE u.activo = 1
          AND u.carrera_id = ?
    `;
            const params = [carreraId];

            if (admin.rol === 'ADMIN') {
                sql += ' AND u.plantel_id = ?';
                params.push(admin.plantel_id);
            }

            const [rows] = await db.query(sql, params);

            if (!rows.length) {
                await bot.sendMessage(chatId, 'ℹ️ No hay registros para esta carrera');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            const parser = new Parser({
                fields: ['alumno', 'plantel', 'fecha_semana', 'monto']
            });

            const csv = parser.parse(rows);
            fs.writeFileSync('reporte_carrera.csv', csv);
            await bot.sendDocument(chatId, 'reporte_carrera.csv');
            fs.unlinkSync('reporte_carrera.csv');

            return volverMenuAdmin(bot, chatId, tgId);
        }

        // =======================
        // 💰 INGRESOS DEL DÍA
        // =======================

        if (q.data === 'admin_ingresos_dia') {
            const admin = await obtenerUsuario(tgId);

            let sql = `
        SELECT 
            u.nombre AS alumno,
            pa.monto,
            pa.created_at
        FROM pagos pa
        JOIN usuarios u ON u.id = pa.usuario_id
        WHERE DATE(pa.created_at) = CURDATE()
    `;
            const params = [];

            if (admin.rol === 'ADMIN') {
                sql += ' AND u.plantel_id = ?';
                params.push(admin.plantel_id);
            }

            const [rows] = await db.query(sql, params);

            if (!rows.length) {
                await bot.sendMessage(chatId, 'ℹ️ No hay ingresos registrados hoy');
                return volverMenuAdmin(bot, chatId, tgId);
            }

            const total = rows.reduce((sum, r) => sum + Number(r.monto), 0);

            const parser = new Parser({
                fields: ['alumno', 'monto', 'created_at']
            });

            const csv = parser.parse(rows);
            fs.writeFileSync('ingresos_dia.csv', csv);

            await bot.sendMessage(chatId, `💰 *Total del día:* $${total}`, {
                parse_mode: 'Markdown'
            });

            await bot.sendDocument(chatId, 'ingresos_dia.csv');
            fs.unlinkSync('ingresos_dia.csv');

            return volverMenuAdmin(bot, chatId, tgId);
        }



        // ===== MENÚ ENVÍO MENSAJES =====


        if (q.data === 'admin_enviar_mensaje') {
            estadoMensaje[tgId] = { paso: 'menu' };

            return bot.sendMessage(chatId, '📣 ¿A quién deseas enviar el mensaje?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📢 Todos', callback_data: 'msg_todos' }],
                        [{ text: '🏫 Por plantel', callback_data: 'msg_plantel' }],
                        [{ text: '🎓 Por carrera', callback_data: 'msg_carrera' }],
                        [{ text: '👤 Alumno específico', callback_data: 'msg_alumno' }],
                        [{ text: '❌ Cancelar', callback_data: 'admin_menu' }]
                    ]
                }
            });
        }


        if (q.data === 'msg_todos') {
            estadoMensaje[tgId].destino = 'todos';
            estadoMensaje[tgId].paso = 'mensaje';
            return bot.sendMessage(chatId, '✍️ Escribe el mensaje a enviar a TODOS:');
        }

        if (q.data === 'msg_plantel') {
            const [planteles] = await db.query('SELECT id,nombre FROM planteles WHERE activo=1');

            estadoMensaje[tgId].paso = 'plantel';

            return bot.sendMessage(chatId, '🏫 Selecciona el plantel:', {
                reply_markup: {
                    inline_keyboard: planteles.map(p => [
                        { text: p.nombre, callback_data: `msg_plantel_${p.id}` }
                    ])
                }
            });
        }

        if (q.data.startsWith('msg_plantel_')) {
            estadoMensaje[tgId].destino = `plantel:${q.data.split('_')[2]}`;
            estadoMensaje[tgId].paso = 'mensaje';
            return bot.sendMessage(chatId, '✍️ Escribe el mensaje para este PLANTEL:');
        }

        if (q.data === 'msg_carrera') {
            const [carreras] = await db.query('SELECT id,nombre FROM carreras WHERE activo=1');

            estadoMensaje[tgId].paso = 'carrera';

            return bot.sendMessage(chatId, '🎓 Selecciona la carrera:', {
                reply_markup: {
                    inline_keyboard: carreras.map(c => [
                        { text: c.nombre, callback_data: `msg_carrera_${c.id}` }
                    ])
                }
            });
        }

        if (q.data.startsWith('msg_carrera_')) {
            estadoMensaje[tgId].destino = `carrera:${q.data.split('_')[2]}`;
            estadoMensaje[tgId].paso = 'mensaje';
            return bot.sendMessage(chatId, '✍️ Escribe el mensaje para esta CARRERA:');
        }

        if (q.data === 'msg_alumno') {
            estadoMensaje[tgId].paso = 'alumno';
            return bot.sendMessage(chatId, '👤 Escribe el ID del alumno:');
        }



        //EDITAR ALUMNO

        const e = estadoEditarAlumno[tgId];
        if (!e) return;

        if (q.data === 'edit_nombre_no') {
            e.paso = 'preguntar_correo';
            return bot.sendMessage(chatId,
                `¿Editar *CORREO*?\nActual: ${e.data.correo || '—'}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Sí', callback_data: 'edit_correo_si' }],
                            [{ text: '❌ No', callback_data: 'edit_correo_no' }]
                        ]
                    }
                }
            );
        }

        if (q.data === 'edit_correo_no') {
            e.paso = 'preguntar_telefono';
            return bot.sendMessage(chatId,
                `¿Editar *TELÉFONO*?\nActual: ${e.data.telefono}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Sí', callback_data: 'edit_tel_si' }],
                            [{ text: '❌ No', callback_data: 'edit_tel_no' }]
                        ]
                    }
                }
            );
        }

        if (q.data === 'edit_tel_no') {
            await db.query(
                'UPDATE usuarios SET nombre=?, correo=?, telefono=? WHERE id=?',
                [e.data.nombre, e.data.correo, e.data.telefono, e.id]
            );

            delete estadoEditarAlumno[tgId];
            await bot.sendMessage(chatId, '✅ Alumno actualizado correctamente');
            return showAdminMenu(bot, chatId, tgId);
        }

        if (q.data.endsWith('_si')) {
            e.editando = q.data;
            return bot.sendMessage(chatId, '✍️ Escribe el nuevo valor:');
        }

       


    });

    bot.on('message', async (msg) => {
        const tgId = msg.from.id;
        const chatId = msg.chat.id;

        if (!await esAdmin(tgId)) return;

        //CAPTURAR TELÉFONO PARA BUSCAR FICHA ALUMNO

        if (estadoFichaAlumno[tgId]?.paso === 'telefono') {
            const telefono = msg.text.replace(/\D/g, '');

            const admin = await obtenerUsuario(tgId);

            let sql = `
        SELECT id, nombre
        FROM usuarios
        WHERE telefono=?
          AND rol='ALUMNO'
          AND activo=1
    `;
            const params = [telefono];

            if (admin.rol === 'ADMIN') {
                sql += ' AND plantel_id=?';
                params.push(admin.plantel_id);
            }

            const [[alumno]] = await db.query(sql, params);

            if (!alumno) {
                delete estadoFichaAlumno[tgId];
                return bot.sendMessage(chatId, '❌ Alumno no encontrado');
            }

            delete estadoFichaAlumno[tgId];

            // Aquí ya llamas a mostrar ficha
            return mostrarFichaAlumno(bot, chatId, tgId, alumno.id);
        }


        // ===== REGISTRAR PAGO - MONTO =====
        if (estadoPago[tgId] && estadoPago[tgId].paso === 'monto') {
            const monto = parseFloat(msg.text);

            if (isNaN(monto) || monto <= 0) {
                return bot.sendMessage(chatId, '❌ Monto inválido. Ingresa un número válido.');
            }

            estadoPago[tgId].monto = monto;
            estadoPago[tgId].paso = 'foto';

            return bot.sendMessage(chatId, '📸 Envía la FOTO del comprobante de pago:');
        }


        // =======================
        // ✉️ ENVIAR MENSAJES (ADMIN / SUPER_ADMIN)
        // =======================

        if (estadoMensaje[tgId]) {
            const m = estadoMensaje[tgId];
            const admin = await obtenerUsuario(tgId);

            // =======================
            // PASO 1: SELECCIÓN DESTINO
            // =======================
            if (m.paso === 'seleccion') {
                m.destino = msg.text.trim().toLowerCase();
                m.paso = 'mensaje';

                return bot.sendMessage(chatId, '✍️ Escribe el mensaje que deseas enviar:');
            }

            if (m.paso === 'alumno') {
                m.destino = msg.text.trim();
                m.paso = 'mensaje';
                return bot.sendMessage(chatId, '✍️ Escribe el mensaje para este alumno:');
            }

            // =======================
            // PASO 2: ENVÍO MENSAJE
            // =======================
            if (m.paso === 'mensaje') {
                const texto = msg.text;
                let usuarios = [];

                // ===== TODOS =====
                if (m.destino === 'todos') {
                    if (admin.rol !== 'SUPER_ADMIN') {
                        delete estadoMensaje[tgId];
                        await bot.sendMessage(chatId, '❌ No tienes permiso para enviar a todos');
                        return volverMenuAdmin(bot, chatId, tgId);
                    }

                    [usuarios] = await db.query(`
                SELECT telegram_id
                FROM usuarios
                WHERE telegram_id IS NOT NULL
                  AND activo=1
            `);
                }

                // ===== PLANTEL =====
                else if (m.destino.startsWith('plantel:')) {
                    const plantelId = m.destino.split(':')[1];

                    if (admin.rol === 'ADMIN' && admin.plantel_id != plantelId) {
                        delete estadoMensaje[tgId];
                        await bot.sendMessage(chatId, '❌ No tienes acceso a este plantel');
                        return volverMenuAdmin(bot, chatId, tgId);
                    }

                    [usuarios] = await db.query(`
                SELECT telegram_id
                FROM usuarios
                WHERE plantel_id=?
                  AND telegram_id IS NOT NULL
                  AND activo=1
            `, [plantelId]);
                }

                // ===== CARRERA =====
                else if (m.destino.startsWith('carrera:')) {
                    const carreraId = m.destino.split(':')[1];

                    let sql = `
                SELECT telegram_id
                FROM usuarios
                WHERE carrera_id=?
                  AND telegram_id IS NOT NULL
                  AND activo=1
            `;
                    const params = [carreraId];

                    if (admin.rol === 'ADMIN') {
                        sql += ' AND plantel_id=?';
                        params.push(admin.plantel_id);
                    }

                    [usuarios] = await db.query(sql, params);
                }

                // ===== ALUMNO INDIVIDUAL =====
                else {
                    const alumnoId = parseInt(m.destino);

                    if (!isNaN(alumnoId)) {
                        let sql = `
                    SELECT telegram_id
                    FROM usuarios
                    WHERE id=?
                      AND activo=1
                `;
                        const params = [alumnoId];

                        if (admin.rol === 'ADMIN') {
                            sql += ' AND plantel_id=?';
                            params.push(admin.plantel_id);
                        }

                        const [[alumno]] = await db.query(sql, params);

                        if (!alumno || !alumno.telegram_id) {
                            delete estadoMensaje[tgId];
                            await bot.sendMessage(chatId, '❌ Alumno no encontrado o sin Telegram');
                            return volverMenuAdmin(bot, chatId, tgId);
                        }

                        usuarios = [alumno];
                    } else {
                        delete estadoMensaje[tgId];
                        await bot.sendMessage(chatId, '❌ Destino inválido');
                        return volverMenuAdmin(bot, chatId, tgId);
                    }
                }

                if (!usuarios.length) {
                    delete estadoMensaje[tgId];
                    await bot.sendMessage(chatId, 'ℹ️ No hay usuarios para enviar el mensaje');
                    return volverMenuAdmin(bot, chatId, tgId);
                }

                for (const u of usuarios) {
                    try {
                        await bot.sendMessage(u.telegram_id, texto);
                    } catch { }
                }

                delete estadoMensaje[tgId];
                await bot.sendMessage(chatId, '✅ Mensaje enviado correctamente');
                return volverMenuAdmin(bot, chatId, tgId);
            }
        }



        // REGISTRAR ALUMNO
        if (estadoAlumno[tgId]) {
            const a = estadoAlumno[tgId];
            if (a.paso === 'nombre') { a.nombre = msg.text; a.paso = 'correo'; return bot.sendMessage(chatId, '📧 Correo del alumno:'); }
            if (a.paso === 'correo') { a.correo = msg.text; a.paso = 'telefono'; return bot.sendMessage(chatId, '📱 Teléfono del alumno (521XXXXXXXXXX):'); }
            if (a.paso === 'telefono') {
                const tel = msg.text.replace(/\D/g, '');
                const [[existe]] = await db.query('SELECT id FROM usuarios WHERE telefono=?', [tel]);
                if (existe) return bot.sendMessage(chatId, '❌ Este teléfono ya está registrado');
                a.telefono = tel; a.paso = 'plantel';
                const [planteles] = await db.query('SELECT id,nombre FROM planteles WHERE activo=1');
                return bot.sendMessage(chatId, '🏫 Selecciona plantel', { reply_markup: { inline_keyboard: planteles.map(p => [{ text: p.nombre, callback_data: `alu_plantel_${p.id}` }]) } });
            }
            if (a.paso === 'dias_pago') {
                a.dias_pago = msg.text.split(',').map(d => d.trim().toLowerCase());
                await db.query(`INSERT INTO usuarios (nombre, correo, telefono, plantel_id, carrera_id, dia_pago, rol, activo) VALUES (?,?,?,?,?,?, 'ALUMNO',1)`, [a.nombre, a.correo, a.telefono, a.plantel_id, a.carrera_id, a.dias_pago.join(',')]);
                delete estadoAlumno[tgId];
                await bot.sendMessage(chatId, '✅ Alumno registrado correctamente');
                return volverMenuAdmin(bot, chatId, tgId);
            }
        }

        // EDITAR ALUMNO
        if (estadoEditarAlumno[tgId]) {
            const e = estadoEditarAlumno[tgId];
            if (e.paso === 'nombre') { e.data.nombre = msg.text || e.data.nombre; e.paso = 'correo'; return bot.sendMessage(chatId, `📧 Correo actual: ${e.data.correo}\nIngresa nuevo correo o deja igual:`); }
            if (e.paso === 'correo') { e.data.correo = msg.text || e.data.correo; e.paso = 'telefono'; return bot.sendMessage(chatId, `📱 Teléfono actual: ${e.data.telefono}\nIngresa nuevo teléfono o deja igual:`); }
            if (e.paso === 'telefono') {
                e.data.telefono = msg.text.replace(/\D/g, '') || e.data.telefono; e.paso = 'plantel';
                const [planteles] = await db.query('SELECT id,nombre FROM planteles WHERE activo=1');
                return bot.sendMessage(chatId, '🏫 Selecciona plantel:', { reply_markup: { inline_keyboard: planteles.map(p => [{ text: p.nombre, callback_data: `editar_plantel_${p.id}` }]) } });
            }
        }

        // EDITAR PLANTEL
        if (estadoEditarAlumno[tgId] && msg.text === undefined) return; // evita fotos etc


        const e = estadoEditarAlumno[tgId];
        if (!e || !e.editando) return;

        if (e.editando === 'edit_nombre_si') e.data.nombre = msg.text;
        if (e.editando === 'edit_correo_si') e.data.correo = msg.text;
        if (e.editando === 'edit_tel_si') e.data.telefono = msg.text.replace(/\D/g, '');

        e.editando = null;

        await db.query(
            'UPDATE usuarios SET nombre=?, correo=?, telefono=? WHERE id=?',
            [e.data.nombre, e.data.correo, e.data.telefono, e.id]
        );

        delete estadoEditarAlumno[tgId];
        await bot.sendMessage(chatId, '✅ Alumno actualizado correctamente');
        return showAdminMenu(bot, chatId, tgId);


    });

    bot.on('photo', async (msg) => {
        const tgId = msg.from.id;
        const chatId = msg.chat.id;
        const p = estadoPago[tgId];
        if (!p || p.paso !== 'foto') return;

        p.file_id = msg.photo.at(-1).file_id;
        await bot.sendPhoto(chatId, p.file_id, {
            caption: `🧾 Confirmar pago\n\n💰 Monto: $${p.monto}\n📅 Semana: ${lunesSemana()}\n📍 Asistió: ${p.asistio == 1 ? 'Sí' : 'No'}`,
            reply_markup: { inline_keyboard: [[{ text: '✅ Confirmar', callback_data: 'confirmar_pago' }], [{ text: '❌ Cancelar', callback_data: 'cancelar_pago' }]] }
        });
    });

    return { showAdminMenu };
};
