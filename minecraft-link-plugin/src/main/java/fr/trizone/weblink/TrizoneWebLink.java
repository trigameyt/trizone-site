package fr.trizone.weblink;

import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;

import java.lang.reflect.Method;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;

public final class TrizoneWebLink extends JavaPlugin {
    private HttpClient httpClient;
    private final AtomicBoolean pollInProgress = new AtomicBoolean(false);
    private final Set<String> paidRanks = new HashSet<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(getConfig().getInt("timeout-seconds", 8)))
                .build();

        paidRanks.clear();
        for (String rank : getConfig().getStringList("paid-rank-groups")) {
            if (rank != null && rank.matches("[A-Za-z0-9_-]{1,32}")) {
                paidRanks.add(rank.toLowerCase(Locale.ROOT));
            }
        }
        if (paidRanks.isEmpty()) {
            paidRanks.addAll(List.of("copper", "iron", "gold", "diamond", "netherite"));
        }

        long intervalSeconds = Math.max(5L, getConfig().getLong("poll-interval-seconds", 10L));
        getServer().getScheduler().runTaskTimerAsynchronously(
                this,
                this::pollDeliveries,
                40L,
                intervalSeconds * 20L
        );

        getLogger().info("TrizoneWebLink v1.2.0 actif. /link <code>, /link sync et livraison Stripe automatique.");
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Cette commande doit être utilisée en jeu.");
            return true;
        }

        if (args.length == 1 && args[0].equalsIgnoreCase("sync")) {
            syncProfile(player);
            return true;
        }

        if (args.length != 1 || !args[0].matches("\\d{6}")) {
            player.sendMessage(color("&8[&5Trizone&8] &7Utilise &f/link <code à 6 chiffres> &7ou &f/link sync&7."));
            return true;
        }

        linkAccount(player, args[0]);
        return true;
    }

    private void linkAccount(Player player, String code) {
        String apiUrl = getConfig().getString("api-url", "");
        String secret = getConfig().getString("secret", "");
        if (!isConfigured(apiUrl, secret, player)) return;

        String rank = getPrimaryGroup(player);
        String json = "{" +
                "\"code\":\"" + escapeJson(code) + "\"," +
                "\"uuid\":\"" + player.getUniqueId() + "\"," +
                "\"username\":\"" + escapeJson(player.getName()) + "\"," +
                "\"rank\":\"" + escapeJson(rank) + "\"" +
                "}";

        send(player, apiUrl, secret, json,
                "&7Vérification du code...",
                "&aCompte lié avec succès ! &7Grade synchronisé : &f" + rank,
                "Code invalide ou expiré.");
    }

    private void syncProfile(Player player) {
        String apiUrl = getConfig().getString("sync-url", "https://trizone.club/api/minecraft/profile-sync");
        String secret = getConfig().getString("secret", "");
        if (!isConfigured(apiUrl, secret, player)) return;

        String rank = getPrimaryGroup(player);
        String json = "{" +
                "\"uuid\":\"" + player.getUniqueId() + "\"," +
                "\"username\":\"" + escapeJson(player.getName()) + "\"," +
                "\"rank\":\"" + escapeJson(rank) + "\"" +
                "}";

        send(player, apiUrl, secret, json,
                "&7Synchronisation du profil...",
                "&aProfil synchronisé. &7Grade : &f" + rank,
                "Ton compte Minecraft n'est pas encore lié au site.");
    }

    private void pollDeliveries() {
        if (!pollInProgress.compareAndSet(false, true)) return;
        try {
            String url = getConfig().getString("delivery-url", "https://trizone.club/api/minecraft/deliveries?format=lines");
            String secret = getConfig().getString("secret", "");
            if (!configured(url, secret)) return;

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(getConfig().getInt("timeout-seconds", 8)))
                    .header("Accept", "text/plain")
                    .header("X-Trizone-Secret", secret)
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                getLogger().warning("API livraisons HTTP " + response.statusCode() + ": " + shortBody(response.body()));
                return;
            }

            List<Delivery> deliveries = parseDeliveries(response.body());
            if (deliveries.isEmpty()) return;

            getServer().getScheduler().runTask(this, () -> {
                for (Delivery delivery : deliveries) {
                    applyDelivery(delivery);
                }
            });
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (Throwable error) {
            getLogger().warning("Impossible de récupérer les livraisons Stripe: " + error.getMessage());
        } finally {
            pollInProgress.set(false);
        }
    }

    private List<Delivery> parseDeliveries(String body) {
        List<Delivery> deliveries = new ArrayList<>();
        if (body == null || body.isBlank()) return deliveries;

        for (String line : body.split("\\R")) {
            if (line == null || line.isBlank()) continue;
            String[] parts = line.trim().split("\\|", -1);
            if (parts.length != 4) {
                getLogger().warning("Livraison ignorée: format invalide.");
                continue;
            }
            try {
                long id = Long.parseLong(parts[0]);
                UUID uuid = UUID.fromString(parts[1]);
                String username = parts[2];
                String rank = parts[3].toLowerCase(Locale.ROOT);
                if (!username.matches("[A-Za-z0-9_.+*\\- ]{1,32}")) throw new IllegalArgumentException("pseudo invalide");
                if (!rank.equals("default") && !paidRanks.contains(rank)) throw new IllegalArgumentException("grade invalide");
                deliveries.add(new Delivery(id, uuid, username, rank));
            } catch (Exception error) {
                getLogger().warning("Livraison ignorée: " + error.getMessage());
            }
        }
        return deliveries;
    }

    private void applyDelivery(Delivery delivery) {
        Plugin luckPerms = getServer().getPluginManager().getPlugin("LuckPerms");
        if (luckPerms == null || !luckPerms.isEnabled()) {
            acknowledgeAsync(delivery.id(), false, "LuckPerms n'est pas actif sur ce serveur.");
            return;
        }

        String commandRoot = getConfig().getString("luckperms-command", "luckperms");
        if (commandRoot == null || !commandRoot.matches("[A-Za-z0-9:_-]{1,40}")) commandRoot = "luckperms";

        CommandSender console = getServer().getConsoleSender();
        String subject = delivery.uuid().toString();

        try {
            // Retire uniquement les cinq groupes de la boutique. Les groupes staff/autres restent intacts.
            for (String group : paidRanks) {
                getServer().dispatchCommand(console, commandRoot + " user " + subject + " parent remove " + group);
            }
            if (!delivery.rank().equals("default")) {
                getServer().dispatchCommand(console, commandRoot + " user " + subject + " parent add " + delivery.rank());
            }

            getLogger().info("Livraison #" + delivery.id() + " appliquée à " + delivery.username() + " -> " + delivery.rank());
            acknowledgeAsync(delivery.id(), true, null);
        } catch (Throwable error) {
            getLogger().warning("Échec livraison #" + delivery.id() + ": " + error.getMessage());
            acknowledgeAsync(delivery.id(), false, error.getMessage());
        }
    }

    private void acknowledgeAsync(long deliveryId, boolean ok, String error) {
        getServer().getScheduler().runTaskAsynchronously(this, () -> {
            try {
                String base = getConfig().getString("delivery-ack-base-url", "https://trizone.club/api/minecraft/deliveries");
                String secret = getConfig().getString("secret", "");
                if (!configured(base, secret)) return;

                String json = "{\"ok\":" + ok + (error == null ? "" : ",\"error\":\"" + escapeJson(shortBody(error)) + "\"") + "}";
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(base.replaceAll("/$", "") + "/" + deliveryId + "/ack"))
                        .timeout(Duration.ofSeconds(getConfig().getInt("timeout-seconds", 8)))
                        .header("Content-Type", "application/json")
                        .header("X-Trizone-Secret", secret)
                        .POST(HttpRequest.BodyPublishers.ofString(json))
                        .build();
                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    getLogger().warning("ACK livraison #" + deliveryId + " refusé: HTTP " + response.statusCode());
                }
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } catch (Throwable ackError) {
                getLogger().warning("Impossible de confirmer la livraison #" + deliveryId + ": " + ackError.getMessage());
            }
        });
    }

    private boolean configured(String url, String secret) {
        return url != null && !url.isBlank() && secret != null && !secret.isBlank() && !"CHANGE_ME".equals(secret);
    }

    private boolean isConfigured(String apiUrl, String secret, Player player) {
        if (!configured(apiUrl, secret)) {
            player.sendMessage(color("&8[&5Trizone&8] &cLa liaison web n'est pas encore configurée."));
            getLogger().warning("Configure les URLs et secret dans plugins/TrizoneWebLink/config.yml");
            return false;
        }
        return true;
    }

    private void send(Player player, String apiUrl, String secret, String json, String waiting, String success, String fallbackError) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .timeout(Duration.ofSeconds(getConfig().getInt("timeout-seconds", 8)))
                .header("Content-Type", "application/json")
                .header("X-Trizone-Secret", secret)
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

        player.sendMessage(color("&8[&5Trizone&8] " + waiting));
        CompletableFuture<HttpResponse<String>> future = httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString());
        future.whenComplete((response, throwable) -> getServer().getScheduler().runTask(this, () -> {
            if (!player.isOnline()) return;
            if (throwable != null) {
                player.sendMessage(color("&8[&5Trizone&8] &cImpossible de contacter le site. Réessaie dans quelques secondes."));
                getLogger().warning("Erreur API liaison: " + throwable.getMessage());
                return;
            }
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                player.sendMessage(color("&8[&5Trizone&8] " + success));
                return;
            }
            String message = extractJsonMessage(response.body());
            player.sendMessage(color("&8[&5Trizone&8] &c" + (message == null ? fallbackError : message)));
        }));
    }

    private String getPrimaryGroup(Player player) {
        try {
            Class<?> providerClass = Class.forName("net.luckperms.api.LuckPermsProvider");
            Object luckPerms = providerClass.getMethod("get").invoke(null);
            Class<?> luckPermsApi = Class.forName("net.luckperms.api.LuckPerms");
            Class<?> userManagerApi = Class.forName("net.luckperms.api.model.user.UserManager");
            Class<?> userApi = Class.forName("net.luckperms.api.model.user.User");
            Object userManager = luckPermsApi.getMethod("getUserManager").invoke(luckPerms);
            Method getUser = userManagerApi.getMethod("getUser", UUID.class);
            Object user = getUser.invoke(userManager, player.getUniqueId());
            if (user != null) {
                Object group = userApi.getMethod("getPrimaryGroup").invoke(user);
                if (group != null && !String.valueOf(group).isBlank()) return String.valueOf(group);
            }
        } catch (ClassNotFoundException ignored) {
            // LuckPerms absent : le site affichera default.
        } catch (Throwable error) {
            getLogger().warning("Impossible de lire le grade LuckPerms: " + error.getMessage());
        }
        return "default";
    }

    private String escapeJson(String input) {
        if (input == null) return "";
        return input.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }

    private String extractJsonMessage(String body) {
        if (body == null) return null;
        String marker = "\"error\":\"";
        int start = body.indexOf(marker);
        if (start < 0) return null;
        start += marker.length();
        int end = body.indexOf('"', start);
        if (end < 0) return null;
        return body.substring(start, end).replace("\\\"", "\"");
    }

    private String shortBody(String body) {
        if (body == null) return "";
        String cleaned = body.replace('\n', ' ').replace('\r', ' ').trim();
        return cleaned.length() <= 500 ? cleaned : cleaned.substring(0, 500);
    }

    private String color(String text) {
        return ChatColor.translateAlternateColorCodes('&', text);
    }

    private record Delivery(long id, UUID uuid, String username, String rank) {}
}
