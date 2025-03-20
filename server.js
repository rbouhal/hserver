const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "hserver-emdmhzb4bgfcf6ac.eastus-01.azurewebsites.net" || "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

let queue = []; // Store users in queue
let activeConnections = new Map(); // Store active peer connections

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("findStranger", () => {
    // If user is already in an active connection, disconnect them first
    if (activeConnections.has(socket.id)) {
      const partnerId = activeConnections.get(socket.id);
      disconnectPeer(socket.id, partnerId);
    }

    if (queue.length > 0) {
      // If there is someone in the queue, connect them
      const partnerId = queue.shift(); // Remove the first user in the queue
      
      // Create active connection between peers
      activeConnections.set(socket.id, partnerId);
      activeConnections.set(partnerId, socket.id);

      // Designate the first peer as the initiator
      io.to(partnerId).emit("matchFound", { partnerId: socket.id, isInitiator: false });
      io.to(socket.id).emit("matchFound", { partnerId, isInitiator: true });
      
      console.log(`Matched ${socket.id} with ${partnerId}`);
    } else {
      // If no one is in the queue, add this user
      queue.push(socket.id);
      io.to(socket.id).emit("waitingInQueue");
    }
    io.emit("waitingUsers", queue.length); // Update waiting user count
  });

  // Handle WebRTC signaling
  socket.on("offer", ({ targetId, offer }) => {
    io.to(targetId).emit("offer", { targetId: socket.id, offer });
  });

  socket.on("answer", ({ targetId, answer }) => {
    io.to(targetId).emit("answer", { answer });
  });

  socket.on("candidate", ({ targetId, candidate }) => {
    io.to(targetId).emit("candidate", { candidate });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Remove from queue if present
    queue = queue.filter(user => user !== socket.id);
    
    // Handle disconnection if in active chat
    if (activeConnections.has(socket.id)) {
      const partnerId = activeConnections.get(socket.id);
      disconnectPeer(socket.id, partnerId);
    }
    
    io.emit("waitingUsers", queue.length); // Update waiting user count
  });

  // Handle manual disconnection from chat
  socket.on("leavePeer", () => {
    if (activeConnections.has(socket.id)) {
      const partnerId = activeConnections.get(socket.id);
      disconnectPeer(socket.id, partnerId);
    }
  });
});

// Helper function to handle peer disconnection
function disconnectPeer(socketId, partnerId) {
  // Notify both peers about disconnection
  io.to(socketId).emit("peerDisconnected");
  io.to(partnerId).emit("peerDisconnected");
  
  // Remove from active connections
  activeConnections.delete(socketId);
  activeConnections.delete(partnerId);
}

const port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
