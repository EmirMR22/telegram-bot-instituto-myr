/* =====================================================
   CREACIÓN DE BASE DE DATOS
===================================================== */
DROP DATABASE IF EXISTS instituto_bot;
CREATE DATABASE instituto_bot
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE instituto_bot;

/* =====================================================
   TABLA: PLANTELES
===================================================== */
CREATE TABLE planteles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(255),
    activo BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

/* =====================================================
   TABLA: CARRERAS
===================================================== */
CREATE TABLE carreras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    activo BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

/* =====================================================
   TABLA: USUARIOS
   (Admins y Alumnos)
===================================================== */
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(100),
    rol ENUM('ADMIN','ALUMNO') NOT NULL,
    plantel_id INT,
    carrera_id INT,
    dia_pago TINYINT COMMENT '1=Lunes ... 7=Domingo',
    activo BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_usuario_plantel
        FOREIGN KEY (plantel_id) REFERENCES planteles(id),

    CONSTRAINT fk_usuario_carrera
        FOREIGN KEY (carrera_id) REFERENCES carreras(id)
);

/* =====================================================
   TABLA: PAGOS SEMANALES
===================================================== */
CREATE TABLE pagos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    fecha_semana DATE NOT NULL COMMENT 'Fecha lunes de la semana',
    monto DECIMAL(10,2),
    pagado BOOLEAN DEFAULT 0,
    asistio BOOLEAN DEFAULT 0,
    comprobante_file_id VARCHAR(255),
    registrado_por INT COMMENT 'Admin que registró el pago',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pago_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),

    CONSTRAINT fk_pago_admin
        FOREIGN KEY (registrado_por) REFERENCES usuarios(id),

    UNIQUE KEY uk_pago_semana (usuario_id, fecha_semana)
);

/* =====================================================
   TABLA: RECORDATORIOS ENVIADOS
   (Evita spam duplicado)
===================================================== */
CREATE TABLE recordatorios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    fecha DATE NOT NULL,
    tipo ENUM('PREVIO','DIA_PAGO') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_recordatorio_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),

    UNIQUE KEY uk_recordatorio (usuario_id, fecha, tipo)
);

/* =====================================================
   TABLA: ASISTENCIAS (opcional, histórico diario)
===================================================== */
CREATE TABLE asistencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    fecha DATE NOT NULL,
    asistio BOOLEAN DEFAULT 1,
    registrado_por INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_asistencia_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),

    CONSTRAINT fk_asistencia_admin
        FOREIGN KEY (registrado_por) REFERENCES usuarios(id),

    UNIQUE KEY uk_asistencia (usuario_id, fecha)
);

/* =====================================================
   DATOS INICIALES
===================================================== */

INSERT INTO planteles (nombre, direccion) VALUES
('Teziutlan', 'Calle Cuauhtémoc #508 Col. Centro'),
('Tlacolula', 'Av.Juárez #49 Plaza Sol (Interior I) Col. Centro');
('Tlatlauquitepec', 'Av. Independencia 9B 1er piso, Colonia Centro');
('Martínez de la Torre', 'Av. Melchor Ocampo #220, Col. Centro');

INSERT INTO carreras (nombre) VALUES
('Estilismo'),
('Barbería'),
('Diplomado de Uñas');
