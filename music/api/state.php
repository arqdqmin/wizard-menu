<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: https://twcoffee.cl");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  exit;
}

$file = __DIR__ . "/state.json";

if ($_SERVER["REQUEST_METHOD"] === "POST") {
  $input = file_get_contents("php://input");
  $data = json_decode($input, true);

  if (!$data || !isset($data["currentSong"])) {
    echo json_encode(["ok" => false, "error" => "Datos inválidos"]);
    exit;
  }

  file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
  echo json_encode(["ok" => true]);
  exit;
}

if (!file_exists($file)) {
  file_put_contents($file, json_encode([
    "currentSong" => "cancion1.mp3",
    "playing" => false,
    "updatedAt" => time()
  ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

echo file_get_contents($file);
