const express = require("express");
const ejs = require("ejs");
const bodyParser = require("body-parser");
const mysql = require("mysql");
const session = require("express-session");
const app = express();

const con = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "node_project",
});

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: "secret" }));
app.use((req, res, next) => {
  con.getConnection((err, connection) => {
    if (err) {
      return next(err);
    }
    req.db = connection;
    next();
  });
});

function isProductInCart(cart, id) {
  for (let i = 0; i < cart.length; i++) {
    if (cart[i].id == id) {
      return true;
    }
  }
  return false;
}
function calculateTotal(cart, req) {
  let total = 0;
  for (let i = 0; i < cart.length; i++) {
    if (cart[i].sale_price) {
      total = total + cart[i].sale_price * cart[i].quantitiy;
    } else {
      total = total + cart[i].price * cart[i].quantity;
    }
  }
  req.session.total = total;
  return total;
}
app.get("/", (req, res) => {
  con.query("SELECT *FROM PRODUCTS", (err, result) => {
    res.render("pages/index", { result: result });
  });
});
app.get("/payment", (req, res) => {
  const total = req.session.total;
  res.render("pages/payment", { total: total });
});
app.get("/verify_payment", (req, res) => {
  const transaction_id = req.query.transaction_id;
  const order_id = req.session.order_id;

  con.connect((err) => {
    if (err) {
      console.log(err);
    } else {
      const query =
        "INSERT INTO payments(order_id,transaction_id,date) VALUES ?";
      const value = [[order_id, transaction_id, new Date()]];
      con.query(query, [value], (err, res) => {
        con.query(
          `UPDATE orders SET status='paid' WHERE id='${order_id}'`,
          (err, result) => {}
        );
      });
    }
  });
  res.redirect("/thank_you");
});
app.get("/thank_you", (req, res) => {
  const order_id = req.session.order_id;
  res.render("pages/thank_you", { order_id: order_id });
});
app.get("/single_product", (req, res) => {
  const id = req.query.id;
  con.query(`SELECT *FROM PRODUCTS WHERE id=${id}`, (err, result) => {
    res.render("pages/single_product", { result: result });
  });
});
app.get("/products", (req, res) => {
  con.query("SELECT *FROM PRODUCTS", (err, result) => {
    res.render("pages/products", { result: result });
  });
});
app.get("/about", (req, res) => {
  res.render("pages/about");
});
app.get("/cart", (req, res) => {
  const cart = req.session.cart;
  const total = req.session.total;
  res.render("pages/cart", { cart: cart, total: total });
});
app.get("/checkout", (req, res) => {
  const total = req.session.total;
  res.render("pages/checkout", { total: total });
});
app.post("/add_to_cart", (req, res) => {
  const id = req.body.id;
  const name = req.body.name;
  const price = req.body.price;
  const sale_price = req.body.sale_price;
  const quantity = req.body.quantity;
  const image = req.body.image;
  const product = {
    id: id,
    name: name,
    price: price,
    sale_price: sale_price,
    quantity: quantity,
    image: image,
  };
  let cart = null;
  if (req.session.cart) {
    cart = req.session.cart;
    if (isProductInCart(cart, id)) {
      cart.push(product);
    }
  } else {
    req.session.cart = [product];
    cart = req.session.cart;
  }
  calculateTotal(cart, req);
  res.redirect("/cart");
});
app.post("/remove_product", (req, res) => {
  const id = req.body.id;
  const cart = req.session.cart;

  for (let i = 0; i < cart.length; i++) {
    if (cart[i].id == id) {
      cart.splice(cart.indexOf(i), 1);
    }
  }

  //re-calculate
  calculateTotal(cart, req);
  res.redirect("/cart");
});
app.post("/edit_product_quantity", (req, res) => {
  const id = req.body.id;
  const quantity = req.body.quantity;
  const increase_btn = req.body.increase_product_quantity_btn;
  const decrease_btn = req.body.decrease_product_quantity_btn;
  const cart = req.session.cart;

  if (increase_btn) {
    for (let i = 0; i < cart.length; i++) {
      if (cart[i].id == id) {
        if (cart[i].quantity >= 0) {
          cart[i].quantity = parseInt(cart[i].quantity) + 1;
        }
      }
    }
  }
  if (decrease_btn) {
    for (let i = 0; i < cart.length; i++) {
      if (cart[i].id == id) {
        if (cart[i].quantity > 1) {
          cart[i].quantity = parseInt(cart[i].quantity) - 1;
        }
      }
    }
  }
  calculateTotal(cart, req);
  res.redirect("/cart");
});
app.post("/place_order", (req, res) => {
  const name = req.body.name;
  const email = req.body.email;
  const phone = req.body.phone;
  const address = req.body.address;
  const city = req.body.city;
  const cost = req.session.total;
  const status = "not paid";
  const date = new Date();
  let products_id = "";
  const id = Date.now();
  req.session.order_id = id;

  const cart = req.session.cart;
  for (let i = 0; i < cart.length; i++) {
    products_id = products_id + "," + cart[i].id;
  }
  con.connect((err) => {
    if (err) {
      console.log(err);
    } else {
      const query =
        "INSERT INTO ORDERS(id,cost,name,email,status,city,address,phone,date,products_id) VALUES ?";
      const value = [
        [
          id,
          cost,
          name,
          email,
          status,
          city,
          address,
          phone,
          date,
          products_id,
        ],
      ];
      con.query(query, [value], (err, result) => {
        if (err) {
          console.log("Error:");
          console.log(err);
        }
        if (result) {
          console.log("Success:");
          console.log(result);
          for (let i = 0; i < cart.length; i++) {
            const query =
              "INSERT INTO order_item(oreder_id,product_id,product_name,product_price,product_image,product_quantity)";
            const values = [
              [
                id,
                cart[i].name,
                cart[i].price,
                cart[i].image,
                cart[i].quantity,
                new Date(),
              ],
            ];
            con.query(query, [values], (err, result) => {});
          }
        }
      });
      res.redirect("/payment");
    }
  });
});

app.listen(8080);
